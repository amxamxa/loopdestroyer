/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import type { PlaybackState, Prompt } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static override styles = css`
    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #111;
    }
    #grid {
      width: 80vmin;
      height: 80vmin;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2.5vmin;
      margin-top: 8vmin;
    }
    prompt-controller {
      width: 100%;
    }
    play-pause-button {
      position: relative;
      width: 15vmin;
    }
    #buttons {
      position: absolute;
      top: 0;
      left: 0;
      padding: 5px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    button {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #0002;
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
      &.active {
        background-color: #fff;
        color: #000;
      }
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    select {
      font: inherit;
      padding: 5px;
      background: #fff;
      color: #000;
      border-radius: 4px;
      border: none;
      outline: none;
      cursor: pointer;
    }
    .presets-group, .bpm-control {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-left: 10px;
      padding-left: 10px;
      border-left: 1px solid #ffffff55;
    }
    .bpm-control {
      color: #fff;
      font-weight: 600;
      user-select: none;
    }
    .bpm-control label {
        width: 80px;
        text-align: left;
        font-size: 13px;
    }
    .bpm-control input[type=range] {
      -webkit-appearance: none;
      appearance: none;
      width: 100px;
      height: 3px;
      background: #ffffff80;
      border-radius: 2px;
      outline: none;
      cursor: pointer;
      transition: background 0.2s;
      vertical-align: middle;
    }
    .bpm-control input[type=range]:hover {
        background: #fff;
    }
    .bpm-control input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      background: #fff;
      border-radius: 50%;
      cursor: pointer;
      border: 1px solid #333;
    }
    .bpm-control input[type=range]::-moz-range-thumb {
      width: 12px;
      height: 12px;
      background: #fff;
      border-radius: 50%;
      cursor: pointer;
      border: 1px solid #333;
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;

  @property({ type: Boolean }) private showMidi = false;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;
  @state() private presets: Record<string, string> = {};
  @state() private selectedPresetName = '';
  @state() private bpm = 144;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor(
    initialPrompts: Map<string, Prompt>,
  ) {
    super();
    this.prompts = initialPrompts;
    this.midiDispatcher = new MidiDispatcher();
    this.loadPresetsFromStorage();
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.prompts = newPrompts;
    this.requestUpdate();

    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  /** Generates radial gradients for each prompt based on weight and color. */
  private readonly makeBackground = throttle(
    () => {
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

      const MAX_WEIGHT = 0.5;
      const MAX_ALPHA = 0.6;

      const bg: string[] = [];

      [...this.prompts.values()].forEach((p, i) => {
        const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff)
          .toString(16)
          .padStart(2, '0');

        const stop = p.weight / 2;
        const x = (i % 4) / 3;
        const y = Math.floor(i / 4) / 3;
        const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    30, // don't re-render more than once every XXms
  );

  private toggleShowMidi() {
    return this.setShowMidi(!this.showMidi);
  }

  public async setShowMidi(show: boolean) {
    this.showMidi = show;
    if (!this.showMidi) return;
    try {
      const inputIds = await this.midiDispatcher.getMidiAccess();
      this.midiInputIds = inputIds;
      this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
    } catch (e: any) {
      this.showMidi = false;
      this.dispatchEvent(new CustomEvent('error', {detail: e.message}));
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private playPause() {
    this.dispatchEvent(new CustomEvent('play-pause'));
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  private loadPresetsFromStorage() {
    const storedPresets = localStorage.getItem('prompt-dj-presets');
    if (storedPresets) {
        try {
            this.presets = JSON.parse(storedPresets);
            const presetNames = Object.keys(this.presets);
            if (presetNames.length > 0) {
                this.selectedPresetName = presetNames[0];
            }
        } catch (e) {
            console.error('Failed to parse presets from localStorage', e);
            localStorage.removeItem('prompt-dj-presets');
        }
    }
  }

  private handleSavePreset() {
    const name = prompt('Enter a name for your preset:');
    if (name && name.trim()) {
        const trimmedName = name.trim();
        const promptsToSave = Array.from(this.prompts.entries());
        this.presets[trimmedName] = JSON.stringify(promptsToSave);
        this.presets = { ...this.presets }; // Trigger update
        this.selectedPresetName = trimmedName;
        localStorage.setItem('prompt-dj-presets', JSON.stringify(this.presets));
    }
  }

  private handleLoadPreset() {
    if (!this.selectedPresetName || !this.presets[this.selectedPresetName]) return;

    try {
        const presetString = this.presets[this.selectedPresetName];
        const loadedPromptsArray: [string, Prompt][] = JSON.parse(presetString);
        this.prompts = new Map(loadedPromptsArray);
        
        this.requestUpdate(); 
        
        this.dispatchEvent(
            new CustomEvent('prompts-changed', { detail: new Map(this.prompts) }),
        );
    } catch (e) {
        console.error('Failed to load preset', e);
        this.dispatchEvent(new CustomEvent('error', { detail: 'Failed to load preset. It might be corrupted.' }));
    }
  }

  private handleDeletePreset() {
    if (!this.selectedPresetName || !this.presets[this.selectedPresetName]) return;

    if (confirm(`Are you sure you want to delete the preset "${this.selectedPresetName}"?`)) {
        delete this.presets[this.selectedPresetName];
        this.presets = { ...this.presets };
        
        const presetNames = Object.keys(this.presets);
        this.selectedPresetName = presetNames.length > 0 ? presetNames[0] : '';
        
        localStorage.setItem('prompt-dj-presets', JSON.stringify(this.presets));
    }
  }

  private handlePresetSelectionChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    this.selectedPresetName = selectElement.value;
  }

  private handleBpmChange(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    this.bpm = parseInt(inputElement.value, 10);
    this.dispatchEvent(new CustomEvent('bpm-changed', { detail: this.bpm }));
  }

  override render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    return html`<div id="background" style=${bg}></div>
      <div id="buttons">
        <button
          @click=${this.toggleShowMidi}
          class=${this.showMidi ? 'active' : ''}
          >MIDI</button
        >
        <select
          @change=${this.handleMidiInputChange}
          .value=${this.activeMidiInputId || ''}
          style=${this.showMidi ? '' : 'visibility: hidden'}>
          ${this.midiInputIds.length > 0
        ? this.midiInputIds.map(
          (id) =>
            html`<option value=${id}>
                    ${this.midiDispatcher.getDeviceName(id)}
                  </option>`,
        )
        : html`<option value="">No devices found</option>`}
        </select>
        <div class="bpm-control">
          <label for="bpm-slider">BPM: ${this.bpm}</label>
          <input
            id="bpm-slider"
            type="range"
            min="77"
            max="211"
            step="1"
            .value=${this.bpm}
            @input=${this.handleBpmChange} />
        </div>
        <div class="presets-group">
          <button @click=${this.handleSavePreset} title="Save current state as a new preset">Save</button>
          ${Object.keys(this.presets).length > 0 ? html`
              <select @change=${this.handlePresetSelectionChange} .value=${this.selectedPresetName} title="Select a preset">
                  ${Object.keys(this.presets).map(name => html`<option value=${name}>${name}</option>`)}
              </select>
              <button @click=${this.handleLoadPreset} ?disabled=${!this.selectedPresetName} title="Load selected preset">Load</button>
              <button @click=${this.handleDeletePreset} ?disabled=${!this.selectedPresetName} title="Delete selected preset">Delete</button>
          ` : ''}
        </div>
      </div>
      <div id="grid">${this.renderPrompts()}</div>
      <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>`;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        cc=${prompt.cc}
        text=${prompt.text}
        weight=${prompt.weight}
        color=${prompt.color}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }
}
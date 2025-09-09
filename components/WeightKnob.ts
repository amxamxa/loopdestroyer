/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

/** Maps prompt weight to halo size. */
const MIN_HALO_SCALE = 1;
const MAX_HALO_SCALE = 2;

/** The amount of scale to add to the halo based on audio level. */
const HALO_LEVEL_MODIFIER = 1;

/** A knob for adjusting and visualizing prompt weight. */
@customElement('weight-knob')
export class WeightKnob extends LitElement {
  static override styles = css`
    :host {
      cursor: grab;
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      flex-shrink: 0;
      touch-action: none;
    }
    svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    #halo {
      position: absolute;
      z-index: -1;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      mix-blend-mode: lighten;
      transform: scale(2);
      will-change: transform;
    }
  `;

  @property({ type: Number }) value = 0;
  @property({ type: String }) color = '#000';
  @property({ type: Number }) audioLevel = 0;

  private dragStartPos = 0;
  private dragStartValue = 0;

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  private handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    this.dragStartPos = e.clientY;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerMove(e: PointerEvent) {
    const delta = this.dragStartPos - e.clientY;
    this.value = this.dragStartValue + delta * 0.01;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  private handlePointerUp() {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    document.body.classList.remove('dragging');
  }

  private handleWheel(e: WheelEvent) {
    const delta = e.deltaY;
    this.value = this.value + delta * -0.0025;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  private describeArc(
    centerX: number,
    centerY: number,
    startAngle: number,
    endAngle: number,
    radius: number,
  ): string {
    const startX = centerX + radius * Math.cos(startAngle);
    const startY = centerY + radius * Math.sin(startAngle);
    const endX = centerX + radius * Math.cos(endAngle);
    const endY = centerY + radius * Math.sin(endAngle);

    const largeArcFlag = endAngle - startAngle <= Math.PI ? '0' : '1';

    return (
      `M ${startX} ${startY}` +
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`
    );
  }

  private renderDefs() {
    return html`
      <radialGradient id="knob-gradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" style="stop-color:#555; stop-opacity:1" />
        <stop offset="60%" style="stop-color:#333; stop-opacity:1" />
        <stop offset="100%" style="stop-color:#111; stop-opacity:1" />
      </radialGradient>
      <linearGradient id="highlight-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#888; stop-opacity:0.8" />
        <stop offset="100%" style="stop-color:#fff; stop-opacity:0" />
      </linearGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="inner-shadow">
        <feOffset dx="0" dy="1" />
        <feGaussianBlur stdDeviation="1" result="offset-blur" />
        <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
        <feFlood flood-color="black" flood-opacity="0.5" result="color" />
        <feComposite operator="in" in="color" in2="inverse" result="shadow" />
        <feComposite operator="over" in="shadow" in2="SourceGraphic" />
      </filter>
    `;
  }

  private renderKnobBase() {
    return html`
      <circle cx="50" cy="50" r="50" fill="#1a1a1a" />
      <circle cx="50" cy="50" r="45" fill="url(#knob-gradient)" filter="url(#inner-shadow)" />
      <path d="M 25 20 A 45 45 0 0 1 75 20" stroke="url(#highlight-gradient)" stroke-width="1.5" fill="none" opacity="0.5" />
    `;
  }

  private renderTextureGrooved() {
    const ribs = [];
    for (let i = 0; i < 360; i += 15) {
      ribs.push(html`<line 
        x1="50" y1="50" 
        x2="50" y2="10" 
        stroke="#000" 
        stroke-width="1"
        stroke-opacity="0.7"
        transform="rotate(${i}, 50, 50)"
      />`);
    }
    return html`<g>${ribs}</g>`;
  }

  private renderTextureAkira() {
    return html`
      <g stroke=${this.color} stroke-width="0.5" fill="none" opacity="0.7">
        <path d="M 30 30 L 50 20 L 70 30" />
        <path d="M 20 50 L 35 45 L 35 55 L 20 50" />
        <path d="M 80 50 L 65 45 L 65 55 L 80 50" />
        <path d="M 30 70 L 50 80 L 70 70" />
      </g>
    `;
  }

  private renderIndicator() {
    const rotationRange = Math.PI * 2 * 0.75;
    const minRot = -rotationRange / 2 - Math.PI / 2;
    const maxRot = rotationRange / 2 - Math.PI / 2;
    const rot = minRot + (this.value / 2) * (maxRot - minRot);
    const dotStyle = styleMap({
      transform: `translate(50px, 50px) rotate(${rot}rad)`,
    });
    
    const indicatorArc = this.value > 0.01 ? this.describeArc(50, 50, minRot, rot, 42) : '';

    return html`
      <path
        d=${this.describeArc(50, 50, minRot, maxRot, 42)}
        fill="none"
        stroke="#000"
        stroke-width="4"
        stroke-opacity="0.5"
        stroke-linecap="round" />
      <path
        d=${indicatorArc}
        fill="none"
        stroke=${this.color}
        stroke-width="4"
        stroke-linecap="round"
        style="filter: url(#glow);" />
      <g style=${dotStyle}>
        <line x1="0" y1="-30" x2="0" y2="-40" stroke="#fff" stroke-width="2" />
      </g>
    `;
  }
  
  override render() {
    let scale = (this.value / 2) * (MAX_HALO_SCALE - MIN_HALO_SCALE);
    scale += MIN_HALO_SCALE;
    scale += this.audioLevel * HALO_LEVEL_MODIFIER;

    const haloStyle = styleMap({
      display: this.value > 0 ? 'block' : 'none',
      background: this.color,
      transform: `scale(${scale})`,
    });
    
    // Smoothly transition between textures based on value
    const groovedOpacity = Math.max(0, Math.min(1, (this.value - 0.5) / 0.5, (1.8 - this.value) / 0.4));
    const akiraOpacity = Math.max(0, (this.value - 1.4) / 0.6);

    return html`
      <div id="halo" style=${haloStyle}></div>
      <svg
        viewBox="0 0 100 100"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}>
        <defs>
            ${this.renderDefs()}
        </defs>
        ${this.renderKnobBase()}
        <g style="transition: opacity 0.3s;" opacity=${groovedOpacity}>
            ${this.renderTextureGrooved()}
        </g>
        <g style="transition: opacity 0.3s;" opacity=${akiraOpacity}>
            ${this.renderTextureAkira()}
        </g>
        ${this.renderIndicator()}
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'weight-knob': WeightKnob;
  }
}
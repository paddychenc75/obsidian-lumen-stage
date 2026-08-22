import "obsidian";
import { CLICK_SLOP, MARK, MAX_INLINE_VH, MAX_SCALE, MIN_SCALE, ZOOM_STEP } from "./constants";
import {
  clamp,
  el,
  isInteractiveTarget,
  measureSvg,
  prefersReducedMotion,
  rootDoc,
  rootWin,
} from "./dom";

export interface CanvasOptions {
  fullscreen?: boolean;
  onClose?: (() => void) | null;
}

function resetSvgInlineLayout(svg: SVGSVGElement): void {
  svg.setCssStyles({
    width: "",
    height: "",
    maxWidth: "",
    display: "",
    margin: "",
  });
}

function syncEmbedParent(host: HTMLElement, on: boolean): void {
  const embed = host.parentElement;
  if (!embed?.instanceOf(HTMLElement) || !embed.hasClass("cm-embed-block")) return;
  embed.toggleClass("lmm-embed", on);
}

export function unwrapHost(host: HTMLElement): void {
  syncEmbedParent(host, false);
  const viewport = host.querySelector(":scope > .lmm-viewport");
  const svg = host.querySelector(".lmm-stage svg") || host.querySelector(":scope > svg");
  host.querySelector(":scope > .lmm-bar")?.remove();
  if (svg?.instanceOf(SVGSVGElement)) {
    resetSvgInlineLayout(svg);
    svg.removeAttribute(MARK);
    if (svg.parentElement !== host) host.insertBefore(svg, viewport);
  }
  viewport?.remove();
  host.classList.remove("lmm-host");
}

interface DragState {
  id: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

interface PanBounds {
  txMin: number;
  txMax: number;
  tyMin: number;
  tyMax: number;
}

export class MermaidCanvas {
  svg: SVGSVGElement;
  fullscreen: boolean;
  onClose: (() => void) | null;
  scale = 1;
  tx = 0;
  ty = 0;
  nat = { w: 320, h: 180 };
  drag: DragState | null = null;
  moved = false;
  destroyed = false;
  overlay: HTMLDivElement | null = null;
  host: HTMLElement | null = null;
  child: HTMLDivElement | null = null;
  lastWidth = 0;
  stage: HTMLDivElement;
  viewport: HTMLDivElement;
  toolbar: HTMLDivElement | null = null;
  btnOut!: HTMLButtonElement;
  gauge!: HTMLButtonElement;
  btnIn!: HTMLButtonElement;
  btnFit!: HTMLButtonElement;
  btnReset!: HTMLButtonElement;
  btnFull!: HTMLButtonElement;
  childFs: MermaidCanvas | null = null;
  ro: ResizeObserver | null = null;

  private animTimer = 0;
  private onWheel!: (event: WheelEvent) => void;
  private onPointerDown!: (event: PointerEvent) => void;
  private onPointerMove!: (event: PointerEvent) => void;
  private onPointerUp!: (event: PointerEvent) => void;
  private onKeyDown!: (event: KeyboardEvent) => void;
  private onResize!: () => void;

  constructor(svg: SVGSVGElement, options: CanvasOptions = {}) {
    this.svg = svg;
    this.fullscreen = !!options.fullscreen;
    this.onClose = options.onClose ?? null;
    this.stage = el("div", "lmm-stage");
    this.viewport = el("div", this.fullscreen ? "lmm-viewport lmm-viewport--fs" : "lmm-viewport");
    this.build();
  }

  static adopt(host: HTMLElement): MermaidCanvas | null {
    const viewport = host.querySelector(":scope > .lmm-viewport");
    const stage = viewport?.querySelector(":scope > .lmm-stage");
    const svg = stage?.querySelector(":scope > svg");
    const toolbar = host.querySelector(":scope > .lmm-bar");
    const buttons = toolbar
      ? Array.from(toolbar.querySelectorAll(":scope .lmm-flair")).flatMap((node) =>
          node.instanceOf(HTMLButtonElement) ? [node] : [],
        )
      : [];
    if (
      !viewport?.instanceOf(HTMLDivElement) ||
      !stage?.instanceOf(HTMLDivElement) ||
      !svg?.instanceOf(SVGSVGElement) ||
      !toolbar?.instanceOf(HTMLDivElement) ||
      buttons.length < 6
    ) {
      return null;
    }

    const canvas = Object.create(MermaidCanvas.prototype) as MermaidCanvas;
    canvas.svg = svg;
    canvas.fullscreen = !!host.closest(".lmm-fs");
    canvas.onClose = null;
    canvas.scale = 1;
    canvas.tx = 0;
    canvas.ty = 0;
    canvas.nat = { w: 320, h: 180 };
    canvas.drag = null;
    canvas.moved = false;
    canvas.destroyed = false;
    const overlay = host.closest(".lmm-fs");
    const child = host.closest(".lmm-fs-doc");
    canvas.overlay = overlay?.instanceOf(HTMLDivElement) ? overlay : null;
    canvas.host = host;
    canvas.child = child?.instanceOf(HTMLDivElement) ? child : null;
    canvas.lastWidth = 0;
    canvas.stage = stage;
    canvas.viewport = viewport;
    canvas.toolbar = toolbar;
    const [btnOut, gauge, btnIn, btnFit, btnReset, btnFull] = buttons;
    if (!btnOut || !gauge || !btnIn || !btnFit || !btnReset || !btnFull) return null;
    canvas.btnOut = btnOut;
    canvas.gauge = gauge;
    canvas.btnIn = btnIn;
    canvas.btnFit = btnFit;
    canvas.btnReset = btnReset;
    canvas.btnFull = btnFull;
    canvas.childFs = null;
    canvas.ro = null;
    canvas.animTimer = 0;
    canvas.rebindBar();
    canvas.attach();
    canvas.scheduleInit();
    syncEmbedParent(host, true);
    svg.setAttribute(MARK, "1");
    return canvas;
  }

  rebindBar(): void {
    const replace = (old: HTMLButtonElement, action: () => void) => {
      const next = old.cloneNode(true);
      if (!next.instanceOf(HTMLButtonElement)) return old;
      old.replaceWith(next);
      next.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      return next;
    };

    this.btnOut = replace(this.btnOut, () => this.zoomBy(1 / ZOOM_STEP));
    this.gauge = replace(this.gauge, () => this.reset(true));
    this.btnIn = replace(this.btnIn, () => this.zoomBy(ZOOM_STEP));
    this.btnFit = replace(this.btnFit, () => this.fit(true));
    this.btnReset = replace(this.btnReset, () => this.reset(true));
    this.btnFull = this.fullscreen
      ? replace(this.btnFull, () => this.close())
      : replace(this.btnFull, () => this.openFullscreen());
  }

  applyNaturalSize(): void {
    this.nat = measureSvg(this.svg) || this.nat;
    this.svg.setCssStyles({
      width: `${this.nat.w}px`,
      height: `${this.nat.h}px`,
      maxWidth: "none",
    });
  }

  build(): void {
    this.applyNaturalSize();

    const parent = this.svg.parentElement;
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute("role", "group");
    this.viewport.setAttribute(
      "aria-label",
      "Mermaid diagram — drag to pan, Ctrl or Cmd and wheel to zoom",
    );
    this.stage.appendChild(this.svg);
    this.viewport.appendChild(this.stage);

    if (this.fullscreen) {
      this.overlay = el("div", "lmm-fs");
      this.overlay.setAttribute("role", "dialog");
      this.overlay.setAttribute("aria-modal", "true");
      this.overlay.setAttribute("aria-label", "Mermaid diagram fullscreen");
      this.child = el("div", "markdown-rendered lmm-fs-doc");
      this.host = el("div", "mermaid lmm-host");
      this.host.appendChild(this.viewport);
      this.child.appendChild(this.host);
      this.overlay.appendChild(this.child);
      this.overlay.addEventListener("pointerdown", (event) => {
        if (event.target === this.overlay) this.close();
      });
      rootDoc().body.appendChild(this.overlay);
    } else {
      const host = this.svg.closest(".mermaid") || parent;
      if (!host?.instanceOf(HTMLElement)) throw new Error("Lumen Stage: mermaid host not found");
      this.host = host;
      this.host.classList.add("lmm-host");
      this.host.appendChild(this.viewport);
      syncEmbedParent(host, true);
    }

    this.buildBar();
    this.attach();
    this.scheduleInit();
  }

  buildBar(): void {
    const host = this.host;
    if (!host) throw new Error("Lumen Stage: mermaid host not found");

    const bar = el("div", "lmm-bar");
    bar.setAttribute("role", "toolbar");

    const kind = el("span", "lmm-kind");
    kind.textContent = "Mermaid";

    const flair = (label: string, title: string, action: () => void) => {
      const node = el("button", "lmm-flair");
      node.type = "button";
      node.textContent = label;
      node.setAttribute("aria-label", title);
      node.title = title;
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      return node;
    };

    this.btnOut = flair("−", "Zoom out", () => this.zoomBy(1 / ZOOM_STEP));
    this.gauge = flair("100%", "Reset view", () => this.reset(true));
    this.btnIn = flair("+", "Zoom in", () => this.zoomBy(ZOOM_STEP));
    this.btnFit = flair("Fit", "Fit to canvas", () => this.fit(true));
    this.btnReset = flair("Reset", "Reset", () => this.reset(true));
    this.btnFull = this.fullscreen
      ? flair("Close", "Close", () => this.close())
      : flair("Full", "Open fullscreen", () => this.openFullscreen());

    const actions = el("div", "lmm-actions");
    actions.appendChild(this.btnOut);
    actions.appendChild(this.gauge);
    actions.appendChild(this.btnIn);
    actions.appendChild(this.btnFit);
    actions.appendChild(this.btnReset);
    actions.appendChild(this.btnFull);

    bar.appendChild(kind);
    bar.appendChild(actions);
    this.toolbar = bar;
    host.insertBefore(bar, this.viewport);
  }

  attach(): void {
    this.onWheel = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const rect = this.viewport.getBoundingClientRect();
      const factor = Math.pow(1.0017, -event.deltaY);
      this.zoomTo(this.scale * factor, event.clientX - rect.left, event.clientY - rect.top, false);
    };

    this.onPointerDown = (event) => {
      if (event.button !== 0) return;
      if (isInteractiveTarget(event.target)) return;
      this.moved = false;
      this.drag = {
        id: event.pointerId,
        sx: event.clientX,
        sy: event.clientY,
        tx: this.tx,
        ty: this.ty,
      };
      this.viewport.classList.add("is-dragging");
      try {
        this.viewport.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort */
      }
    };

    this.onPointerMove = (event) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      const dx = event.clientX - this.drag.sx;
      const dy = event.clientY - this.drag.sy;
      if (Math.hypot(dx, dy) > CLICK_SLOP) this.moved = true;
      this.tx = this.drag.tx + dx;
      this.ty = this.drag.ty + dy;
      this.clampPan();
      this.render(false);
    };

    this.onPointerUp = (event) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      const wasClick = !this.moved;
      this.viewport.classList.remove("is-dragging");
      try {
        this.viewport.releasePointerCapture(this.drag.id);
      } catch {
        /* already released */
      }
      this.drag = null;
      if (wasClick && !this.fullscreen && !isInteractiveTarget(event.target)) {
        if (window.getSelection && String(window.getSelection())) return;
        this.openFullscreen();
      }
    };

    this.onKeyDown = (event) => {
      if (this.fullscreen && event.key === "Escape") {
        event.preventDefault();
        this.close();
        return;
      }
      if (!this.fullscreen && rootDoc().activeElement !== this.viewport) return;
      switch (event.key) {
        case "+":
        case "=":
          event.preventDefault();
          this.zoomBy(ZOOM_STEP);
          break;
        case "-":
        case "_":
          event.preventDefault();
          this.zoomBy(1 / ZOOM_STEP);
          break;
        case "0":
          event.preventDefault();
          this.reset(true);
          break;
        case "f":
        case "F":
          if (!this.fullscreen) {
            event.preventDefault();
            this.openFullscreen();
          }
          break;
        default:
          break;
      }
    };

    this.onResize = () => {
      if (this.destroyed) return;
      this.applyNaturalSize();
      const width = this.viewport.clientWidth;
      if (!width || width === this.lastWidth) return;
      this.lastWidth = width;
      if (this.fullscreen) this.fit(false);
      else this.reset(false);
    };

    this.viewport.addEventListener("wheel", this.onWheel, { passive: false });
    this.viewport.addEventListener("pointerdown", this.onPointerDown);
    this.viewport.addEventListener("pointermove", this.onPointerMove);
    this.viewport.addEventListener("pointerup", this.onPointerUp);
    this.viewport.addEventListener("pointercancel", this.onPointerUp);
    this.viewport.addEventListener("keydown", this.onKeyDown);
    if (this.fullscreen) rootDoc().addEventListener("keydown", this.onKeyDown, true);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(this.onResize);
      this.ro.observe(this.viewport);
    }
  }

  scheduleInit(attempt = 0): void {
    rootWin().requestAnimationFrame(() => {
      if (this.destroyed) return;
      this.applyNaturalSize();
      if (this.viewport.clientWidth > 0 && this.nat.w > 40) {
        if (this.fullscreen) this.fit(false);
        else this.reset(false);
      }
      if (attempt < 30) this.scheduleInit(attempt + 1);
    });
    if (attempt === 0) {
      rootWin().setTimeout(() => {
        if (this.destroyed) return;
        this.applyNaturalSize();
        if (this.fullscreen) this.fit(false);
        else this.reset(false);
      }, 320);
    }
  }

  maxInlineHeight(): number {
    return Math.round(rootWin().innerHeight * MAX_INLINE_VH);
  }

  widthScale(): number {
    const width = this.viewport.clientWidth;
    if (!width || !this.nat.w) return 1;
    return clamp(width / this.nat.w, MIN_SCALE, MAX_SCALE);
  }

  setInlineHeight(scale: number): void {
    if (this.fullscreen) return;
    const height = Math.max(48, Math.min(Math.ceil(this.nat.h * scale), this.maxInlineHeight()));
    this.viewport.setCssStyles({ height: "" });
    this.viewport.setCssProps({ "--lmm-vh": `${height}px` });
  }

  reset(animate: boolean): void {
    const scale = this.widthScale();
    this.scale = scale;
    this.tx = 0;
    this.ty = 0;
    this.setInlineHeight(scale);
    this.lastWidth = this.viewport.clientWidth;
    this.clampPan();
    this.render(animate);
  }

  fit(animate: boolean): void {
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight || this.maxInlineHeight();
    if (!width || !this.nat.w) return;
    const scale = clamp(Math.min(width / this.nat.w, height / this.nat.h), MIN_SCALE, MAX_SCALE);
    this.scale = scale;
    if (!this.fullscreen) this.setInlineHeight(scale);
    const usedW = this.nat.w * scale;
    const usedH = this.nat.h * scale;
    const viewW = this.viewport.clientWidth;
    const viewH = this.viewport.clientHeight;
    this.tx = usedW <= viewW ? (viewW - usedW) / 2 : 0;
    this.ty = usedH <= viewH ? (viewH - usedH) / 2 : 0;
    this.clampPan();
    this.render(animate);
  }

  panBounds(): PanBounds {
    const viewW = this.viewport.clientWidth;
    const viewH = this.viewport.clientHeight;
    const usedW = this.nat.w * this.scale;
    const usedH = this.nat.h * this.scale;
    return {
      txMin: usedW <= viewW ? (viewW - usedW) / 2 : viewW - usedW,
      txMax: usedW <= viewW ? (viewW - usedW) / 2 : 0,
      tyMin: usedH <= viewH ? (viewH - usedH) / 2 : viewH - usedH,
      tyMax: usedH <= viewH ? (viewH - usedH) / 2 : 0,
    };
  }

  clampPan(): void {
    const bounds = this.panBounds();
    this.tx = clamp(this.tx, bounds.txMin, bounds.txMax);
    this.ty = clamp(this.ty, bounds.tyMin, bounds.tyMax);
  }

  zoomTo(next: number, originX: number, originY: number, animate: boolean): void {
    const scale = clamp(next, MIN_SCALE, MAX_SCALE);
    const ratio = scale / this.scale;
    this.tx = originX - (originX - this.tx) * ratio;
    this.ty = originY - (originY - this.ty) * ratio;
    this.scale = scale;
    if (!this.fullscreen) this.setInlineHeight(scale);
    this.clampPan();
    this.render(animate);
  }

  zoomBy(factor: number): void {
    this.zoomTo(this.scale * factor, this.viewport.clientWidth / 2, this.viewport.clientHeight / 2, true);
  }

  render(animate: boolean): void {
    if (animate && !prefersReducedMotion()) {
      this.stage.classList.add("is-animating");
      rootWin().clearTimeout(this.animTimer);
      this.animTimer = rootWin().setTimeout(() => {
        this.stage.classList.remove("is-animating");
      }, 200);
    }
    this.stage.setCssProps({
      "--tx": `${this.tx}px`,
      "--ty": `${this.ty}px`,
      "--scale": String(this.scale),
    });
    this.gauge.textContent = `${Math.round(this.scale * 100)}%`;
    this.btnOut.disabled = this.scale <= MIN_SCALE + 1e-4;
    this.btnIn.disabled = this.scale >= MAX_SCALE - 1e-4;
  }

  openFullscreen(): void {
    if (this.childFs) return;
    const clone = this.svg.cloneNode(true);
    if (!clone.instanceOf(SVGSVGElement)) return;
    resetSvgInlineLayout(clone);
    this.childFs = new MermaidCanvas(clone, {
      fullscreen: true,
      onClose: () => {
        this.childFs = null;
        if (this.viewport.isConnected) this.viewport.focus({ preventScroll: true });
      },
    });
  }

  close(): void {
    if (!this.fullscreen) return;
    this.destroy();
    if (this.onClose) this.onClose();
  }

  detach(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    rootWin().clearTimeout(this.animTimer);
    if (this.ro) this.ro.disconnect();
    this.viewport.removeEventListener("wheel", this.onWheel);
    this.viewport.removeEventListener("pointerdown", this.onPointerDown);
    this.viewport.removeEventListener("pointermove", this.onPointerMove);
    this.viewport.removeEventListener("pointerup", this.onPointerUp);
    this.viewport.removeEventListener("pointercancel", this.onPointerUp);
    this.viewport.removeEventListener("keydown", this.onKeyDown);
    if (this.fullscreen) rootDoc().removeEventListener("keydown", this.onKeyDown, true);
    if (this.childFs) {
      this.childFs.destroy();
      this.childFs = null;
    }
  }

  destroy(): void {
    this.detach();
    if (this.fullscreen) {
      if (this.overlay) this.overlay.remove();
      return;
    }
    if (this.host) unwrapHost(this.host);
  }
}

import "obsidian";

export function rootWin(): Window {
  return typeof activeWindow !== "undefined" ? activeWindow : window;
}

export function prefersReducedMotion(): boolean {
  const view = rootWin();
  return !!(view.matchMedia && view.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  return createEl(tag, className ? { cls: className } : undefined);
}

export function parsePx(value: string): number {
  if (!value || /%$/.test(value.trim())) return 0;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export interface Size {
  w: number;
  h: number;
}

export function measureSvg(svg: SVGSVGElement): Size | null {
  const viewBox = svg.viewBox && svg.viewBox.baseVal;
  if (viewBox && viewBox.width && viewBox.height) {
    return { w: viewBox.width, h: viewBox.height };
  }
  const attrW = parsePx(svg.getAttribute("width") || "");
  const attrH = parsePx(svg.getAttribute("height") || "");
  if (attrW && attrH) return { w: attrW, h: attrH };
  try {
    const box = svg.getBBox();
    if (box.width && box.height) return { w: box.width, h: box.height };
  } catch {
    /* SVG not in the document yet */
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width > 40 && rect.height > 40) return { w: rect.width, h: rect.height };
  return null;
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !("instanceOf" in target)) return false;
  const node = target as Node;
  return node.instanceOf(Element) && !!node.closest("a, button, input, textarea, select, .lmm-bar");
}

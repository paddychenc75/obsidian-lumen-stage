import { Notice, Plugin } from "obsidian";
import { MermaidCanvas, unwrapHost } from "./canvas";
import { MARK } from "./constants";
import { measureSvg, rootDoc, rootWin } from "./dom";

const TEARDOWN_KEY = "__lumenStageTeardown";

type TeardownWindow = Window & { [TEARDOWN_KEY]?: number };

export default class LumenStagePlugin extends Plugin {
  views = new Set<MermaidCanvas>();
  observer: MutationObserver | null = null;
  private scanQueued = false;

  onload(): void {
    this.cancelDeferredTeardown();
    this.adoptExisting();

    this.app.workspace.onLayoutReady(() => this.scan());
    const queue = () => this.queueScan();
    this.registerEvent(this.app.workspace.on("layout-change", queue));
    this.registerEvent(this.app.workspace.on("active-leaf-change", queue));
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        window.setTimeout(() => this.scan(), 200);
      }),
    );

    this.observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) continue;
          if (node.closest?.(".lmm-viewport, .lmm-fs, .lmm-bar")) continue;
          this.queueScan();
          return;
        }
      }
    });
    this.observer.observe(rootDoc().body, { childList: true, subtree: true });

    this.registerMarkdownPostProcessor((el) => {
      window.setTimeout(() => this.scanWithin(el), 220);
    });

    this.addCommand({
      id: "fullscreen-first-diagram",
      name: "Open first Mermaid diagram fullscreen",
      callback: () => this.fullscreenFirst(),
    });
  }

  onunload(): void {
    if (this.observer) this.observer.disconnect();
    for (const view of this.views) {
      if (view.fullscreen) view.destroy();
      else view.detach();
    }
    this.views.clear();
    this.scheduleDeferredTeardown();
  }

  cancelDeferredTeardown(): void {
    const win = rootWin() as TeardownWindow;
    if (win[TEARDOWN_KEY]) {
      win.clearTimeout(win[TEARDOWN_KEY]);
      delete win[TEARDOWN_KEY];
    }
  }

  scheduleDeferredTeardown(): void {
    const win = rootWin() as TeardownWindow;
    win.clearTimeout(win[TEARDOWN_KEY]);
    win[TEARDOWN_KEY] = win.setTimeout(() => {
      delete win[TEARDOWN_KEY];
      rootDoc().querySelectorAll(".lmm-fs").forEach((node) => node.remove());
      rootDoc().querySelectorAll(".mermaid.lmm-host").forEach((node) => {
        if (node instanceof HTMLElement) unwrapHost(node);
      });
    }, 80);
  }

  adoptExisting(): void {
    rootDoc().querySelectorAll(".mermaid.lmm-host").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if ([...this.views].some((view) => view.host === node)) return;
      const adopted = MermaidCanvas.adopt(node);
      if (adopted) this.views.add(adopted);
    });
  }

  queueScan(): void {
    if (this.scanQueued) return;
    this.scanQueued = true;
    window.setTimeout(() => {
      this.scanQueued = false;
      this.scan();
    }, 80);
  }

  scan(): void {
    this.adoptExisting();
    this.scanWithin(rootDoc().body);
  }

  scanWithin(root: ParentNode | null): void {
    if (!root || !("querySelectorAll" in root)) return;
    root.querySelectorAll('.mermaid svg, svg[id^="mermaid-"]').forEach((svg) => this.process(svg));
  }

  process(node: Element): void {
    if (!(node instanceof SVGSVGElement)) return;
    if (node.closest(".lmm-viewport") || node.closest(".lmm-fs")) return;
    if (node.hasAttribute(MARK)) {
      if (node.closest(".lmm-host")) return;
      node.removeAttribute(MARK);
    }
    if (!node.closest(".mermaid")) return;
    if (!node.viewBox?.baseVal?.width) return;
    const parent = node.parentElement;
    if (!parent) return;
    const size = measureSvg(node);
    if (!size || size.w < 40 || size.h < 20) return;
    node.setAttribute(MARK, "1");
    this.views.add(new MermaidCanvas(node));
  }

  fullscreenFirst(): void {
    const view = [...this.views].find((item) => !item.fullscreen && item.viewport?.isConnected);
    if (view) view.openFullscreen();
    else new Notice("No Mermaid diagram found in this note.");
  }
}

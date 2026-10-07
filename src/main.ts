import { MarkdownView, Notice, Plugin } from "obsidian";
import { MermaidCanvas, unwrapHost } from "./canvas";
import { MARK, RETRY_DELAYS } from "./constants";
import { measureSvg } from "./dom";

const TEARDOWN_KEY = "__lumenStageTeardown";
const DIAGRAMS = '.mermaid svg, svg[id^="mermaid-"]';
const OWN_CHROME = ".lmm-viewport, .lmm-fs, .lmm-bar";

type TeardownWindow = Window & { [TEARDOWN_KEY]?: number };

/** `pending` means the diagram is not ready to wrap yet and the scan should come back. */
type Outcome = "done" | "skip" | "pending";

export default class LumenStagePlugin extends Plugin {
  views = new Set<MermaidCanvas>();
  observers = new Map<Document, MutationObserver>();
  private scanQueued = false;
  private retry = 0;
  private retryTimer = 0;

  private onPointerOver = (event: PointerEvent): void => {
    // Safety net: a diagram the scan missed is wrapped as soon as the pointer reaches it.
    const target = event.target as Node | null;
    if (!target?.instanceOf(Element)) return;
    const host = target.closest(".mermaid");
    if (!host || host.hasClass("lmm-host") || host.closest(OWN_CHROME)) return;
    const svg = host.querySelector("svg");
    if (svg) this.process(svg);
  };

  onload(): void {
    this.cancelDeferredTeardown();

    this.app.workspace.onLayoutReady(() => this.scan());
    const queue = () => this.queueScan();
    this.registerEvent(this.app.workspace.on("layout-change", queue));
    this.registerEvent(this.app.workspace.on("active-leaf-change", queue));
    this.registerEvent(this.app.workspace.on("window-open", queue));
    this.registerEvent(this.app.workspace.on("window-close", queue));
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        window.setTimeout(() => this.scan(), 200);
      }),
    );

    this.syncDocuments();

    this.registerMarkdownPostProcessor((el) => {
      window.setTimeout(() => {
        if (this.scanWithin(el)) this.scheduleRetry(true);
      }, 220);
    });

    this.addCommand({
      id: "fullscreen-first-diagram",
      name: "Open first Mermaid diagram fullscreen",
      callback: () => this.fullscreenFirst(),
    });
  }

  onunload(): void {
    window.clearTimeout(this.retryTimer);
    const docs = [...this.observers.keys()];
    for (const doc of docs) this.unobserve(doc);
    for (const view of this.views) {
      if (view.fullscreen) view.destroy();
      else view.detach();
    }
    this.views.clear();
    this.scheduleDeferredTeardown(docs);
  }

  cancelDeferredTeardown(): void {
    const win = window as TeardownWindow;
    if (win[TEARDOWN_KEY]) {
      win.clearTimeout(win[TEARDOWN_KEY]);
      delete win[TEARDOWN_KEY];
    }
  }

  scheduleDeferredTeardown(docs: Document[]): void {
    const win = window as TeardownWindow;
    win.clearTimeout(win[TEARDOWN_KEY]);
    win[TEARDOWN_KEY] = win.setTimeout(() => {
      delete win[TEARDOWN_KEY];
      for (const doc of docs) {
        doc.querySelectorAll(".lmm-fs").forEach((node) => node.remove());
        doc.querySelectorAll(".mermaid.lmm-host").forEach((node) => {
          if (node.instanceOf(HTMLElement)) unwrapHost(node);
        });
      }
    }, 80);
  }

  /** The main window plus every pop-out window that holds a workspace leaf. */
  documents(): Set<Document> {
    const docs = new Set<Document>([document]);
    this.app.workspace.iterateAllLeaves((leaf) => {
      docs.add(leaf.view.containerEl.ownerDocument);
    });
    return docs;
  }

  syncDocuments(): void {
    const docs = this.documents();
    for (const doc of [...this.observers.keys()]) {
      if (!docs.has(doc)) this.unobserve(doc);
    }
    for (const doc of docs) {
      if (!this.observers.has(doc)) this.observe(doc);
    }
  }

  observe(doc: Document): void {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!node.instanceOf(HTMLElement) && !node.instanceOf(SVGElement)) continue;
          if (node.closest(OWN_CHROME)) continue;
          this.retry = 0;
          this.queueScan();
          return;
        }
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    doc.addEventListener("pointerover", this.onPointerOver);
    this.observers.set(doc, observer);
  }

  unobserve(doc: Document): void {
    this.observers.get(doc)?.disconnect();
    doc.removeEventListener("pointerover", this.onPointerOver);
    this.observers.delete(doc);
  }

  adoptExisting(doc: Document): void {
    doc.querySelectorAll(".mermaid.lmm-host").forEach((node) => {
      if (!node.instanceOf(HTMLElement)) return;
      // The overlay is owned by the canvas that opened it; adopting it would add a second
      // controller and strand the opener with a fullscreen it can never close.
      if (node.closest(".lmm-fs")) return;
      if ([...this.views].some((view) => view.host === node)) return;
      const adopted = MermaidCanvas.adopt(node);
      if (adopted) this.views.add(adopted);
    });
  }

  /** Obsidian re-renders diagrams wholesale; drop the canvases it left behind. */
  prune(): void {
    for (const view of this.views) {
      if (view.fullscreen || view.viewport.isConnected) continue;
      view.detach();
      this.views.delete(view);
    }
  }

  queueScan(): void {
    if (this.scanQueued) return;
    this.scanQueued = true;
    window.setTimeout(() => {
      this.scanQueued = false;
      this.scan();
    }, 80);
  }

  scheduleRetry(pending: boolean): void {
    if (!pending) {
      this.retry = 0;
      return;
    }
    if (this.retryTimer || this.retry >= RETRY_DELAYS.length) return;
    const delay = RETRY_DELAYS[this.retry++] ?? 1000;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0;
      this.scan();
    }, delay);
  }

  scan(): void {
    this.syncDocuments();
    this.prune();
    let pending = false;
    for (const doc of this.observers.keys()) {
      this.adoptExisting(doc);
      if (this.scanWithin(doc.body)) pending = true;
    }
    this.scheduleRetry(pending);
  }

  /** Returns true when a diagram was found that is not ready to wrap yet. */
  scanWithin(root: ParentNode | null): boolean {
    if (!root || !("querySelectorAll" in root)) return false;
    let pending = false;
    root.querySelectorAll(DIAGRAMS).forEach((svg) => {
      if (this.process(svg) === "pending") pending = true;
    });
    return pending;
  }

  process(node: Element): Outcome {
    if (!node.instanceOf(SVGSVGElement)) return "skip";
    // Covers the wrapped diagram, the overlay, and the toolbar's own icon SVGs.
    if (node.closest(OWN_CHROME)) return "skip";
    const host = node.closest(".mermaid");
    if (!host?.instanceOf(HTMLElement)) return "skip";
    // Obsidian measures a diagram in a scratch .mermaid on <body>, then moves the result into
    // the note. Wrapping the scratch copy would be thrown away, or worse, copied as dead markup.
    if (!host.isConnected || host.parentElement === host.ownerDocument.body) return "pending";
    if (!node.viewBox?.baseVal?.width) return "pending";
    const size = measureSvg(node);
    if (!size || size.w < 40 || size.h < 20) return "pending";

    if (host.hasClass("lmm-host")) {
      // The host was re-rendered in place: clear the chrome that belonged to the old diagram.
      for (const view of this.views) {
        if (view.host !== host) continue;
        view.detach();
        this.views.delete(view);
      }
      host.querySelectorAll(":scope > .lmm-bar, :scope > .lmm-viewport").forEach((el) => el.remove());
    }

    node.setAttribute(MARK, "1");
    try {
      this.views.add(new MermaidCanvas(node));
    } catch (error) {
      node.removeAttribute(MARK);
      console.error("Lumen Stage: could not enhance a Mermaid diagram", error);
      return "skip";
    }
    return "done";
  }

  fullscreenFirst(): void {
    const live = [...this.views].filter((view) => !view.fullscreen && view.viewport.isConnected);
    const scope = this.app.workspace.getActiveViewOfType(MarkdownView)?.containerEl;
    const inNote = scope ? live.filter((view) => scope.contains(view.viewport)) : [];
    const pool = (inNote.length ? inNote : live).sort((a, b) =>
      a.viewport.compareDocumentPosition(b.viewport) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    // Prefer the diagram the reader is looking at over one scrolled out of sight.
    const onScreen = pool.find((view) => {
      const rect = view.viewport.getBoundingClientRect();
      return rect.height > 0 && rect.bottom > 0 && rect.top < view.win.innerHeight;
    });
    const view = onScreen ?? pool[0];
    if (view) view.openFullscreen();
    else new Notice("No Mermaid diagram found in this note.");
  }
}

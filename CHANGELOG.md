# Changelog

## 1.1.0

Reliability, interaction, and a reworked toolbar.

Fixed

- Fullscreen could only be opened once: a rescan adopted the overlay as if it were a diagram in the note, which left the original diagram believing its overlay was still open
- Diagrams that Obsidian re-rendered (theme or CSS change, Live Preview rebuild) left dead canvases and observers behind; they are now pruned on every scan
- Obsidian's hidden measuring copy on `<body>` is no longer wrapped mid-render
- A diagram that was not ready when the scan ran is retried with a short backoff, and any diagram the scan still missed is picked up when the pointer reaches it
- A key press in fullscreen was handled twice when the stage had focus
- Typing while the overlay was open edited the note behind it; the overlay now takes focus
- A cancelled touch gesture was treated as a click and opened fullscreen
- The settle pass after load no longer snaps the view back once you have moved it

Changed

- Toolbar buttons are grouped icon buttons using Obsidian's `clickable-icon`, so themes and the app no longer draw generic bordered buttons in the header band; the band drops back to its intended height
- The zoom readout is a button that returns to actual size (100%)
- Reset shrinks a wide diagram to the column but no longer enlarges a small one past its natural size; Fit still fills the canvas
- Zooming inline grows the stage but does not shrink it, so the note does not jump under the pointer
- Fullscreen: wheel and trackpad scroll pan, `Ctrl` / `Cmd` + wheel zooms, trackpad pinch zooms at a usable rate, Fit leaves a margin, and a hint line lists the gestures
- The fullscreen command prefers the diagram on screen in the active note

Added

- Two-finger pinch zoom and pan on touch screens; a diagram that fits vertically lets the page scroll through it
- Arrow keys pan the focused stage
- Pop-out windows are observed and enhanced
- Fullscreen entrance animation, disabled under reduced motion

## 1.0.2

Remaining community CSS lint.

- Drop `:has()`; Live Preview embed padding is cleared by toggling `.lmm-embed` on the parent from TypeScript
- Drop print `!important`; viewport height now uses `--lmm-vh` so print can override without inline height

## 1.0.1

Community review fixes. No interaction changes.

- Replace `el.style.*` assignments with CSS classes and the official `setCssStyles` / `setCssProps` APIs so themes can override chrome
- Drive pan/zoom with `--tx` / `--ty` / `--scale` custom properties instead of writing `transform` from JavaScript
- Use `instanceOf()` for cross-window DOM checks (pop-out windows)
- Remove unnecessary type assertions
- Add a GitHub Actions release workflow that attests `main.js`, `manifest.json`, and `styles.css`

## 1.0.0

First engineered release of the independent Mermaid stage plugin.

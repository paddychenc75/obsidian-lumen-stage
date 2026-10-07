# Lumen Stage

An Obsidian plugin that turns rendered Mermaid diagrams into a small stage: pan, zoom, fit, reset, and a lightweight fullscreen overlay.

It works with **any theme**. [Lumen Glass](https://github.com/paddychenc75/obsidian-lumen) is an optional skin, not a dependency. The theme only styles the `.lmm-*` classes this plugin creates. The plugin only uses Obsidian CSS tokens, so other themes keep a quiet header band over a flush figure.

The theme works without this plugin. This plugin works without the theme.

## Interaction

Inline, in the note:

- Drag the canvas to pan
- `Ctrl` / `Cmd` + wheel, or a trackpad pinch, zooms toward the pointer
- Ordinary wheel movement scrolls the note
- Click the diagram, or the fullscreen button, for a lightweight overlay
- Header buttons: zoom out, zoom readout (click for 100%), zoom in, fit, reset, fullscreen
- With the stage focused: `+` / `-` zoom, `0` resets, arrow keys pan, `F` opens fullscreen

In the overlay:

- Drag, wheel, or two-finger scroll pans; `Ctrl` / `Cmd` + wheel or pinch zooms
- `Esc`, the close button, or the dimmed backdrop closes it

On touch screens, two fingers pinch-zoom and pan. A diagram that fits its stage vertically lets the page scroll through it.

Reset shows the diagram at its natural size, shrunk to the column when it is wider. Fit fills the canvas.

Command: **Open first Mermaid diagram fullscreen** opens the diagram on screen in the active note.

The chrome is a silent 36px header band with icon buttons. There is no drafting grid and no floating instrument toolbar.

Internal class names stay on the `lmm-*` prefix so existing Lumen Glass scoped styles keep matching. Chrome rules use two classes at most, so a theme can restyle them with `.lmm-host .lmm-*`.

## Install

This plugin is not on the community list yet. Install it locally:

1. Copy this folder into `<vault>/.obsidian/plugins/lumen-stage/`, or symlink it there while developing.
2. Run `npm install` and `npm run build` if `main.js` is missing.
3. Enable **Lumen Stage** under **Settings → Community plugins**.

Reload the plugin after a rebuild. Obsidian reads `manifest.json`, `main.js`, and `styles.css` from that folder.

## Independent use

No Lumen Glass, Style Settings, or other companion plugin is required. On a stock theme you still get pan, zoom, fit, reset, and fullscreen. Live Preview also drops the extra embed pad around an enhanced diagram so the stage is not wrapped in a second shell.

If you do use Lumen Glass, the theme replaces the fallback chrome with its code-block header band and diagram surface. That skin is opt-in by installing the theme; it is not compiled into this plugin.

## Development

Requires Node.js 20 or later.

```bash
npm install
npm run build
npm run check
```

- `npm run build` typechecks, then bundles `src/` into `main.js` with esbuild
- `npm run check` typechecks and validates manifest, versions, and CSS token rules
- `npm run dev` watches `src/` and rebuilds with an inline sourcemap

Edit TypeScript under `src/`. Do not hand-edit `main.js`. After a build, reload the plugin in Obsidian.

## License

Lumen Stage is available under the [MIT License](LICENSE).

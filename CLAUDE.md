# Lumen Stage

Obsidian plugin that wraps rendered Mermaid diagrams in a pan/zoom stage with a fullscreen overlay.

## Commits

- Commit messages must be written in English: subject, body, and trailers. This also applies to tags, release notes, and `CHANGELOG.md`.
- Follow the existing subject style, for example `Release 1.0.2: drop :has and print !important for community CSS lint.`

## Workflow

- Edit TypeScript under `src/`. Never hand-edit `main.js`; it is built output that stays tracked for local installs.
- `npm run build` typechecks and bundles. `npm run check` typechecks and validates manifest, versions, and CSS token rules. Run both before committing.
- To release: set the version in `package.json`, run `npm run version` to sync `manifest.json` and `versions.json`, add a `CHANGELOG.md` entry, then push a tag named after the version. The tag triggers `.github/workflows/release.yml`.

## Constraints

- Keep the `lmm-*` class names and the six `.lmm-flair` buttons in order (zoom out, readout, zoom in, fit, reset, fullscreen/close). The Lumen Glass theme styles them and `MermaidCanvas.adopt` relies on the order.
- `styles.css` uses Obsidian native variables only, no `--lg-*` without a fallback, no `:has()`, no `!important`. Keep chrome selectors at two classes or fewer so themes can override them.
- No `el.style.*` assignments; use classes, `setCssStyles`, or `setCssProps`. Use `instanceOf()` instead of `instanceof` for DOM checks so pop-out windows work.
- Obsidian renders a diagram in a scratch `.mermaid` on `<body>` and delays rendering while the window is hidden. Do not wrap the scratch copy, and do not treat a missing diagram in a background window as a bug.

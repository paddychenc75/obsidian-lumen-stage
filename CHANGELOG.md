# Changelog

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

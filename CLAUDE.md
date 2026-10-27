# GuidedTrack Program Flow

Static, client-side site: drop a GuidedTrack "Package code" zip, get a Mermaid flowchart of `*program:` / `*switch:` references between programs. Design: `docs/superpowers/specs/2026-10-27-gt-program-flow-diagram-design.md`.

## Layout

- `res/js/src/` — pure modules (`zip-entries`, `program-name`, `parse`, `graph`, `mermaid`) plus the browser entry `main.mjs`. Keep the pure modules free of DOM access so `node --test` can import them.
- `res/js/bundle.js` — esbuild output, committed, about 5 MB because Mermaid is bundled. Rebuild with `pnpm build` before committing UI changes.
- `test/*.test.mjs` — `node --test`. The e2e test imports Playwright dynamically and skips if absent; never `npm install playwright` in the container.

## Facts that are easy to get wrong

- GuidedTrack zips store UTF-8 names without the UTF-8 flag; `fixZipName` in `zip-entries.mjs` repairs fflate's Latin-1 decoding. A `/` in a program name is U+2215 in the file name.
- Mermaid 12.2 renders `#quot;`-style entity codes as garbage; labels use HTML entities (`&quot;`, `&lt;`, `&gt;`, `&amp;`) instead.
- Mermaid output must stay deterministic (ids in code-point order of name, nodes before edges) because tests compare exact strings.
- Mermaid's default SVG sizing shrinks big graphs to the container width; `sizeDiagram` in `main.mjs` switches to natural size when "Fit to width" (on by default) is unticked.
- Mermaid is initialised with top-level `htmlLabels: false` so labels are SVG `<text>` (one `tspan.row` per wrapped line), not HTML in `foreignObject`. HTML labels taint the canvas and break the PNG export. In text mode `&quot;` is not decoded, so `fixQuotes` patches the rendered text nodes.
- `*.zip` is gitignored on purpose: sample zips contain the user's program source.
- ESLint's `css/use-baseline` rule rejects non-baseline CSS (e.g. `resize`, `ui-monospace`); `docs/` is excluded from lint and prettier.

## Commands

`pnpm build`, `pnpm watch`, `pnpm serve`, `pnpm test`, `pnpm lint`. Real-zip check: `GT_SAMPLE_ZIP=./some.zip pnpm test`.

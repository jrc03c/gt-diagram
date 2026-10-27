# GuidedTrack Program Flow Diagram: Design

## Goal

A static website where a user drops a zip of GuidedTrack program source files (the "Package code" download from guidedtrack.com) and gets back a Mermaid flowchart of the program's call structure, expressed solely in terms of programs and subprograms. Nothing else in the programs (questions, variables, labels, services) is represented.

Given a zip containing `program_a` (which contains `*program: program_b`) and `program_b`, the output is:

```
flowchart TD
    n0["program_a"]
    n1["program_b"]
    n0 --> n1
```

## Non-goals

- Modelling control flow inside a program (`*goto`, `*if`, `*label`, pages).
- Resolving dynamic program names such as `*program: {someVariable}`. These are flagged, not resolved.
- Fetching program source from guidedtrack.com. Input is only the zip.
- A server. Everything runs in the browser.

## Facts about the input (verified against a real "Package code" zip, 2026-10-27)

- One top-level folder named after the zip, containing one file per program. No directory entries, no nesting beyond that folder.
- File name is the program name verbatim, with no extension. Names may contain spaces, hyphens, `|`, `@`, and `- public` suffixes.
- A `/` in a program name (e.g. `@jrc03c/show-error`) is stored in the file name as U+2215 DIVISION SLASH (`∕`).
- File names are UTF-8 bytes but the zip's UTF-8 flag (general purpose bit 11) is not set. `fflate` therefore decodes them as Latin-1, producing mojibake unless re-decoded.
- Some files use CRLF line endings, others LF. A single zip mixes both.
- `*program:` lines appear at any indentation (inside `*if`, answers, `*group`, etc.), sometimes with trailing whitespace after the name.
- Comment lines start with `--` (after optional indentation) and may contain `*program:` text that must be ignored.
- The zip does not necessarily contain every program that is referenced. In the sample, 10 of 47 referenced programs were absent (presumably programs the downloader does not own).
- `*switch:` did not occur in the sample but is documented as a non-returning program transfer, and is treated as a second edge kind.

## Architecture

Fully client-side static site, built on the existing scaffold (`esbuild` bundles `res/js/src/main.mjs` to `res/js/bundle.js`; `index.html` loads the bundle). No runtime network requests. Deployable to any static host.

Dependencies added: `fflate` (zip decoding) and `mermaid` (in-page rendering). Both are vendored or bundled from `node_modules` at build time, never loaded from a CDN at runtime.

### Modules (all under `res/js/src/`)

Pure modules have no DOM or browser dependencies, so they run under Node for tests.

1. `zip-entries.mjs` (pure): `entriesFromZip(uint8array) -> Array<{ name, text }>`
   - Uses `fflate.unzipSync`.
   - Re-decodes entry names: if every character is ≤ U+00FF, re-encode as bytes and attempt a strict UTF-8 decode; use the result if it succeeds, otherwise keep the original.
   - Skips directory entries, anything under `__MACOSX/`, and files whose basename starts with `.`.
   - Decodes file contents as UTF-8.

2. `program-name.mjs` (pure): `programNameFromPath(path) -> string`
   - Takes the basename (text after the last `/`).
   - Replaces every U+2215 with `/`.
   - Strips a trailing `.gt` extension if present.

3. `parse.mjs` (pure): `parseReferences(text) -> Array<{ kind, target, line }>`
   - Splits on `\n`, strips a trailing `\r` from each line.
   - Ignores a line whose first non-whitespace characters are `--`.
   - Matches `^\s*\*(program|switch)\s*:\s*(.*?)\s*$` (case-sensitive keyword). `kind` is `"program"` or `"switch"`. `target` is the trimmed name. `line` is the 1-based line number.
   - An empty target after trimming is skipped.

4. `graph.mjs` (pure): `buildGraph(files: Array<{ name, text }>) -> { nodes, edges, warnings }`
   - `nodes`: `Map<name, { name, inZip: boolean, dynamic: boolean }>`. Every file is a node with `inZip: true`. Every referenced target not matching a file is added with `inZip: false`. A target containing `{` and `}` gets `dynamic: true` (it is still a node, labelled with the raw text).
   - `edges`: deduplicated on `(from, to, kind)`. Each edge records `count` (number of occurrences) for the warnings panel, though the diagram does not display it.
   - `warnings`: array of `{ type, message }` with types `external` (target not in zip), `dynamic` (interpolated target), `duplicate` (two files map to the same program name; the first wins), `skipped` (entry ignored, with reason).
   - Programs in the zip with no edges in either direction still appear as nodes.

5. `mermaid.mjs` (pure): `toMermaid(graph, { direction = "TD" }) -> string`
   - First line `flowchart TD` (or `LR`).
   - Node ids are `n0`, `n1`, … assigned in sorted order of program name (locale-independent code point sort) so output is deterministic.
   - Labels are wrapped in double quotes; a literal `"` becomes `#quot;`. Nothing else is escaped, since Mermaid treats quoted labels as text.
   - `program` edges: `a --> b`. `switch` edges: `a -. switch .-> b`.
   - Every node is declared on its own line before the edges so isolated nodes render.
   - Nodes with `inZip: false` get `:::external`; nodes with `dynamic: true` get `:::dynamic`. A `classDef external stroke-dasharray: 5 5` line is appended only when at least one external node exists, and likewise `classDef dynamic stroke-dasharray: 2 2` for dynamic nodes, so simple diagrams stay minimal.
   - Edges are emitted sorted by `(from id, to id, kind)`.

6. `main.mjs` (browser): wires the UI. Reads the chosen `File` as an `ArrayBuffer`, calls the pure pipeline, renders with `mermaid.render`, and fills the source and warnings panels.

### Data flow

```
File (zip) -> Uint8Array -> entriesFromZip -> [{name,text}]
  -> programNameFromPath (per entry) -> buildGraph -> toMermaid -> string
  -> mermaid.render -> SVG into the page; string into the textarea
```

## User interface

Single page, `index.html` plus `res/css/global.css`.

- Header with a one-paragraph explanation and a note that processing happens entirely in the browser.
- Drop zone that also acts as a file picker (`<input type="file" accept=".zip">`). Dropping or choosing a zip starts processing immediately.
- Direction toggle (TD / LR) that re-renders without re-reading the zip.
- Rendered diagram (SVG) in a horizontally scrollable container.
- Mermaid source in a read-only `<textarea>` with a Copy button, and a Download `.mmd` button.
- Warnings panel listing external programs (with which programs call them), dynamic targets, duplicates, and skipped entries. Hidden when empty.
- Legend: solid border = in zip, dashed border = referenced but not in zip, dotted edge = `*switch`.
- Mermaid is initialised with `startOnLoad: false`, `securityLevel: "strict"`, and raised `maxEdges` / `maxTextSize` so large programs render.

## Error handling

- File is not a zip or is corrupt (`fflate` throws): show "Could not read this file as a zip" in an error banner. No diagram.
- Zip has no usable entries: show "No program files found in this zip".
- Mermaid render fails: show the Mermaid error text in the banner, but still show the Mermaid source so the user can take it elsewhere.
- All errors are shown in the page; nothing is only logged to the console.

## Testing

- Unit tests with Node's built-in runner (`node --test test/`), added as `pnpm test`. No test framework dependency.
- Pure modules are tested directly:
  - `parse.mjs`: indentation, trailing whitespace, CRLF, `--` comments, `*switch`, empty target, interpolated target.
  - `program-name.mjs`: nested path, U+2215, `.gt` suffix.
  - `zip-entries.mjs`: a zip built in the test with `fflate.zipSync` whose names are supplied as raw UTF-8 bytes with the UTF-8 flag unset, containing U+2215 and `__MACOSX/` and dotfile entries.
  - `graph.mjs` and `mermaid.mjs`: the two-file example from the request (exact expected output), external node, dynamic node, duplicate name, isolated node, deduplicated edges.
- End-to-end smoke test with Playwright (`test/e2e.test.mjs`, also under `node --test`): serve the built site, load it, feed it a zip generated in the test, assert an `<svg>` appears with the expected node labels and that the textarea contains the expected Mermaid. Skipped with a message if the bundle has not been built.
- Manual verification against the real zip in the workspace root (not committed; `*.zip` is added to `.gitignore` because it contains the user's program source).

## Build and run

- `pnpm install` then `pnpm build` produces `res/js/bundle.js`.
- `pnpm serve` serves the site locally.
- `pnpm test` runs unit and e2e tests.
- Mermaid is large (roughly 3 MB minified). It is acceptable for this tool; if esbuild bundling of Mermaid's lazy-loaded diagram modules proves awkward, the fallback is to copy `mermaid.min.js` from the npm package into `res/js/vendor/` at build time and load it with a second `<script>` tag.

## Out of scope for this iteration, possible follow-ups

- Edge labels with call counts.
- Clicking a node to view that program's source.
- Collapsing the `- public` library programs into a single node.

# GuidedTrack Program Flow

A static web page that takes the zip of program source files produced by GuidedTrack's **Package code** button and draws a [Mermaid](https://mermaid.js.org/) flowchart of which programs call which. Only `*program:` (call and return) and `*switch:` (transfer without return) lines are read. Everything runs in the browser; the zip never leaves your computer.

## Use

Open `index.html` from any static host (or `pnpm serve` and visit `http://localhost:8000/`), drop the zip on the page, and you get:

- the rendered diagram at natural size in a scrollable box, with a "Fit to width" checkbox and a top-to-bottom / left-to-right toggle;
- the Mermaid source, with Copy and Download buttons;
- notes about programs that are referenced but missing from the zip, calls whose target is a variable, and files that were skipped.

Solid nodes are programs in the zip. Dashed nodes are referenced but not included (for example shared `- public` library programs you do not own). Dotted nodes are `*program: {variable}` calls that cannot be resolved statically. Solid arrows are `*program:` calls; dotted labelled arrows are `*switch:` transfers.

## Develop

```sh
pnpm install
pnpm build        # bundles res/js/src/main.mjs into res/js/bundle.js
pnpm watch        # rebuild on change
pnpm serve        # http://localhost:8000/
pnpm test         # node --test
pnpm lint         # eslint + prettier --check
```

Tests use Node's built-in runner. `test/e2e.test.mjs` drives the built page in headless Chromium through Playwright and skips itself when Playwright is not installed or the bundle has not been built. `test/real-zip.test.mjs` runs only when `GT_SAMPLE_ZIP` points at a real download, e.g. `GT_SAMPLE_ZIP=./my_programs.zip pnpm test`.

## How GuidedTrack's zip is laid out

Learned from a real download:

- one top-level folder, one file per program, no extension; the file name is the program name;
- a `/` in a program name is stored as `∕` (U+2215);
- file names are UTF-8 but the zip's UTF-8 flag is unset, so naive readers see mojibake;
- line endings are a mix of CRLF and LF;
- the zip only contains programs you own, so calls into other people's programs show up as dashed external nodes.

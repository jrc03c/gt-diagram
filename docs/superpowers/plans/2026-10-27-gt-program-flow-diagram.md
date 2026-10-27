# GuidedTrack Program Flow Diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static site that turns a zip of GuidedTrack program source files into a Mermaid flowchart of which programs call which, rendered in the page and available as copyable text.

**Architecture:** Fully client-side. Five pure ES modules (zip decoding, program-name derivation, line parsing, graph building, Mermaid emission) are composed by a browser entry module that drives the UI and renders with Mermaid. esbuild bundles everything into one script. Node's built-in test runner tests the pure modules directly; Playwright (when present) runs one end-to-end smoke test.

**Tech Stack:** Vanilla JS (ES modules), `fflate` 0.8.3, `mermaid` 12.2.0, `esbuild` 0.25, `node --test`, Playwright 1.49 (optional, not a package dependency), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-27-gt-program-flow-diagram-design.md`

## Global Constraints

- Node 24, pnpm 12. `"type": "module"` is set in `package.json`; every JS file is an ES module.
- Prettier config: no semicolons, double quotes, 2-space indent, `arrowParens: "avoid"`. Run `npx prettier --write` on every file you create.
- ESLint flat config at `eslint.config.js`; `npx eslint .` must pass.
- No runtime network requests. `fflate` and `mermaid` are bundled from `node_modules`; never loaded from a CDN.
- Never run `npm install playwright` or `playwright install`. Playwright is preinstalled in the container and is imported dynamically, so tests skip cleanly where it is absent.
- Tests run with `node --test` (no framework). Test files live in `test/` and are named `*.test.mjs`.
- `*.zip` is gitignored. Never commit the sample zip in the workspace root; it contains the user's program source.
- Mermaid 12.2.0 label escaping (verified 2026-10-27): HTML entities `&amp;` `&quot;` `&lt;` `&gt;` render correctly; Mermaid's own `#quot;` codes do NOT (they leave placeholder garbage). Use HTML entities. This supersedes the spec's `#quot;` rule.
- Mermaid output format: four-space indentation, `flowchart TD` or `flowchart LR` header, node ids `n0..nK` in code-point order of program name, every node declared before any edge, `classDef` lines only when used.

---

### Task 1: Project configuration

**Files:**
- Modify: `package.json`
- Modify: `build.mjs`
- Modify: `eslint.config.js`
- Create: `.prettierignore`
- Create: `test/smoke.test.mjs`

**Interfaces:**
- Produces: `pnpm test` runs `node --test`; `pnpm build` writes a minified `res/js/bundle.js`.

- [x] **Step 1: Add the test script and confirm dependencies are declared**

`fflate` and `mermaid` were already added with `pnpm add -D fflate@0.8.3 mermaid@12.2.0`. Edit `package.json` so `scripts` reads:

```json
"scripts": {
  "build": "node build.mjs",
  "lint": "eslint . && prettier --check .",
  "serve": "python3 -m http.server",
  "test": "node --test",
  "watch": "node build.mjs --watch"
}
```

Confirm `devDependencies` contains `"fflate": "0.8.3"` and `"mermaid": "12.2.0"` (exact versions, no caret; edit if pnpm wrote carets).

- [x] **Step 2: Minify the bundle**

In `build.mjs`, change the esbuild command string to:

```js
`npx esbuild res/js/src/main.mjs --bundle --minify --outfile=res/js/bundle.js`
```

- [x] **Step 3: Keep the bundle out of lint and format**

Add to the top of the array in `eslint.config.js` (before the first object):

```js
{ ignores: ["res/js/bundle.js", "node_modules/**"] },
```

Create `.prettierignore`:

```
res/js/bundle.js
pnpm-lock.yaml
node_modules
```

- [x] **Step 4: Write a smoke test so the runner is proven**

Create `test/smoke.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"

test("test runner works", () => {
  assert.equal(1 + 1, 2)
})
```

- [x] **Step 5: Run everything**

Run: `pnpm test`
Expected: `# pass 1`, `# fail 0`.

Run: `pnpm lint`
Expected: no errors (prettier may list files to format; run `npx prettier --write .` and re-run until clean).

- [x] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml build.mjs eslint.config.js .prettierignore test/smoke.test.mjs
git commit -m "Configure test runner, minified build, and lint ignores"
```

---

### Task 2: Parse `*program:` and `*switch:` references

**Files:**
- Create: `res/js/src/parse.mjs`
- Test: `test/parse.test.mjs`

**Interfaces:**
- Produces: `parseReferences(text: string) -> Array<{ kind: "program" | "switch", target: string, line: number }>`. `line` is 1-based. Order is source order.

- [x] **Step 1: Write the failing tests**

Create `test/parse.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { parseReferences } from "../res/js/src/parse.mjs"

test("finds a top-level *program: call with its line number", () => {
  const text = "Hello, world!\n*question: How are you today?\n*program: program_b\n"
  assert.deepEqual(parseReferences(text), [
    { kind: "program", target: "program_b", line: 3 },
  ])
})

test("finds calls at any indentation and trims trailing whitespace", () => {
  const text =
    "*if: x = 1\n\t*program: deep one\t\n\t\t\t*program:   spaced   \n"
  assert.deepEqual(parseReferences(text), [
    { kind: "program", target: "deep one", line: 2 },
    { kind: "program", target: "spaced", line: 3 },
  ])
})

test("handles CRLF line endings", () => {
  const text = "a\r\n*program: b\r\n*program: c\r\n"
  assert.deepEqual(
    parseReferences(text).map(r => r.target),
    ["b", "c"],
  )
})

test("ignores comment lines that mention *program:", () => {
  const text = "-- *program: old thing\n--*program: other\n\t-- *program: nested\n*program: real\n"
  assert.deepEqual(parseReferences(text), [
    { kind: "program", target: "real", line: 4 },
  ])
})

test("recognises *switch: as a separate kind", () => {
  const text = "*switch: Hub Program\n\t*reset\n"
  assert.deepEqual(parseReferences(text), [
    { kind: "switch", target: "Hub Program", line: 1 },
  ])
})

test("skips an empty target", () => {
  assert.deepEqual(parseReferences("*program:\n*program:   \n"), [])
})

test("keeps interpolated targets verbatim", () => {
  assert.deepEqual(parseReferences("*program: {nextProgram}\n"), [
    { kind: "program", target: "{nextProgram}", line: 1 },
  ])
})

test("does not match other keywords or prose", () => {
  const text = "*programme: nope\nThe *program: keyword is nice\n*question: *program: x\n"
  assert.deepEqual(parseReferences(text), [])
})

test("returns an empty array for empty input", () => {
  assert.deepEqual(parseReferences(""), [])
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test test/parse.test.mjs`
Expected: FAIL with `Cannot find module` for `parse.mjs`.

- [x] **Step 3: Implement the parser**

Create `res/js/src/parse.mjs`:

```js
// Finds the program-to-program references in one GuidedTrack source file.
// Only `*program:` (call and return) and `*switch:` (transfer, no return)
// are recognised; everything else in the file is ignored.

const REFERENCE = /^\s*\*(program|switch)\s*:\s*(.*?)\s*$/
const COMMENT = /^\s*--/

export function parseReferences(text) {
  const refs = []
  const lines = text.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "")
    if (COMMENT.test(line)) continue

    const match = REFERENCE.exec(line)
    if (!match) continue

    const target = match[2]
    if (!target) continue

    refs.push({ kind: match[1], target, line: i + 1 })
  }

  return refs
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test test/parse.test.mjs`
Expected: 9 passing, 0 failing.

- [x] **Step 5: Format and commit**

```bash
npx prettier --write res/js/src/parse.mjs test/parse.test.mjs
git add res/js/src/parse.mjs test/parse.test.mjs
git commit -m "Parse *program: and *switch: references from GuidedTrack source"
```

---

### Task 3: Derive a program name from a zip entry path

**Files:**
- Create: `res/js/src/program-name.mjs`
- Test: `test/program-name.test.mjs`

**Interfaces:**
- Produces: `programNameFromPath(path: string) -> string`.

- [x] **Step 1: Write the failing tests**

Create `test/program-name.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { programNameFromPath } from "../res/js/src/program-name.mjs"

test("uses the basename of a nested path", () => {
  assert.equal(programNameFromPath("my_programs/program_a"), "program_a")
  assert.equal(programNameFromPath("a/b/c/program_a"), "program_a")
})

test("keeps a bare filename as-is", () => {
  assert.equal(programNameFromPath("program_a"), "program_a")
})

test("maps the Unicode division slash back to a forward slash", () => {
  assert.equal(
    programNameFromPath("zip/@jrc03c∕string∕join"),
    "@jrc03c/string/join",
  )
})

test("strips a trailing .gt extension", () => {
  assert.equal(programNameFromPath("zip/program_a.gt"), "program_a")
})

test("does not strip .gt from the middle of a name", () => {
  assert.equal(programNameFromPath("zip/my.gt.program"), "my.gt.program")
})

test("preserves spaces, hyphens, pipes and the public suffix", () => {
  assert.equal(
    programNameFromPath("zip/Clearer Thinking | Report Errors"),
    "Clearer Thinking | Report Errors",
  )
  assert.equal(
    programNameFromPath("zip/general consent form - public"),
    "general consent form - public",
  )
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test test/program-name.test.mjs`
Expected: FAIL with `Cannot find module`.

- [x] **Step 3: Implement**

Create `res/js/src/program-name.mjs`:

```js
// GuidedTrack's "Package code" zip names each file after its program,
// verbatim and without an extension, except that a "/" inside a program
// name is written as U+2215 DIVISION SLASH so it can be a filename.

const DIVISION_SLASH = "∕"

export function programNameFromPath(path) {
  let name = path.slice(path.lastIndexOf("/") + 1)
  name = name.replaceAll(DIVISION_SLASH, "/")
  if (name.endsWith(".gt")) name = name.slice(0, -".gt".length)
  return name
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test test/program-name.test.mjs`
Expected: 6 passing.

- [x] **Step 5: Format and commit**

```bash
npx prettier --write res/js/src/program-name.mjs test/program-name.test.mjs
git add res/js/src/program-name.mjs test/program-name.test.mjs
git commit -m "Derive program names from zip entry paths"
```

---

### Task 4: Read entries out of the zip

**Files:**
- Create: `res/js/src/zip-entries.mjs`
- Test: `test/zip-entries.test.mjs`

**Interfaces:**
- Consumes: `fflate` (`unzipSync`, `strFromU8`).
- Produces:
  - `fixZipName(name: string) -> string`: repairs a Latin-1 mis-decoding of UTF-8 bytes.
  - `entriesFromZip(bytes: Uint8Array) -> { entries: Array<{ path: string, text: string }>, skipped: Array<{ path: string, reason: string }> }`. Throws if `bytes` is not a zip (fflate's error propagates).

Background: GuidedTrack's zip stores UTF-8 filenames without setting the UTF-8 flag (general purpose bit 11). `fflate` then decodes them as Latin-1, so `∕` (bytes E2 88 95) arrives as the three characters `â\u0088\u0095`. `fixZipName` reverses that. `fflate.zipSync` always sets the flag, so the test clears bit 11 in the raw zip bytes to reproduce the real-world input.

- [x] **Step 1: Write the failing tests**

Create `test/zip-entries.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { strToU8, zipSync } from "fflate"
import { entriesFromZip, fixZipName } from "../res/js/src/zip-entries.mjs"

// Clear general-purpose bit 11 (UTF-8 names) in every local file header
// (PK\3\4, flags at offset 6) and central directory entry (PK\1\2, flags at
// offset 8), which is how GuidedTrack's zips arrive.
function clearUtf8Flags(zip) {
  const out = new Uint8Array(zip)
  for (let i = 0; i + 3 < out.length; i++) {
    if (out[i] !== 0x50 || out[i + 1] !== 0x4b) continue
    if (out[i + 2] === 0x03 && out[i + 3] === 0x04) out[i + 7] &= ~0x08
    if (out[i + 2] === 0x01 && out[i + 3] === 0x02) out[i + 9] &= ~0x08
  }
  return out
}

test("fixZipName repairs Latin-1 mis-decoded UTF-8", () => {
  assert.equal(fixZipName("@aâ\u0088\u0095b"), "@a∕b")
})

test("fixZipName leaves ASCII and genuine Unicode alone", () => {
  assert.equal(fixZipName("plain/name - public"), "plain/name - public")
  assert.equal(fixZipName("@a∕b"), "@a∕b")
})

test("fixZipName leaves genuine Latin-1 text that is not valid UTF-8 alone", () => {
  assert.equal(fixZipName("café"), "café")
})

test("entriesFromZip returns each file's path and UTF-8 text", () => {
  const zip = zipSync({
    "my_programs/program_a": strToU8("Hello\n*program: program_b\n"),
    "my_programs/program_b": strToU8("Welcome! é\n"),
  })
  const { entries, skipped } = entriesFromZip(zip)
  assert.deepEqual(
    entries.sort((a, b) => (a.path < b.path ? -1 : 1)),
    [
      { path: "my_programs/program_a", text: "Hello\n*program: program_b\n" },
      { path: "my_programs/program_b", text: "Welcome! é\n" },
    ],
  )
  assert.deepEqual(skipped, [])
})

test("entriesFromZip repairs names when the UTF-8 flag is not set", () => {
  const zip = clearUtf8Flags(
    zipSync({ "z/@jrc03c∕show-error": strToU8("x") }),
  )
  const { entries } = entriesFromZip(zip)
  assert.deepEqual(
    entries.map(e => e.path),
    ["z/@jrc03c∕show-error"],
  )
})

test("entriesFromZip skips directories, __MACOSX and dotfiles", () => {
  const zip = zipSync({
    "z/": new Uint8Array(0),
    "z/real": strToU8("ok"),
    "__MACOSX/z/._real": strToU8("junk"),
    "z/.DS_Store": strToU8("junk"),
  })
  const { entries, skipped } = entriesFromZip(zip)
  assert.deepEqual(entries, [{ path: "z/real", text: "ok" }])
  assert.deepEqual(
    skipped.sort((a, b) => (a.path < b.path ? -1 : 1)),
    [
      { path: "__MACOSX/z/._real", reason: "macOS metadata" },
      { path: "z/.DS_Store", reason: "hidden file" },
    ],
  )
})

test("entriesFromZip strips a leading byte-order mark from file text", () => {
  const zip = zipSync({ "z/p": strToU8("﻿*program: q\n") })
  assert.equal(entriesFromZip(zip).entries[0].text, "*program: q\n")
})

test("entriesFromZip throws on data that is not a zip", () => {
  assert.throws(() => entriesFromZip(strToU8("this is not a zip file")))
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test test/zip-entries.test.mjs`
Expected: FAIL with `Cannot find module`.

- [x] **Step 3: Implement**

Create `res/js/src/zip-entries.mjs`:

```js
import { strFromU8, unzipSync } from "fflate"

// GuidedTrack's zips store UTF-8 filenames without the UTF-8 flag, so
// fflate decodes them as Latin-1. If every character fits in one byte,
// reinterpret those bytes as UTF-8; keep the original if that fails.
export function fixZipName(name) {
  for (const ch of name) {
    if (ch.codePointAt(0) > 0xff) return name
  }

  const bytes = Uint8Array.from(name, ch => ch.charCodeAt(0))

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return name
  }
}

export function entriesFromZip(bytes) {
  const unzipped = unzipSync(bytes)
  const entries = []
  const skipped = []

  for (const [rawPath, data] of Object.entries(unzipped)) {
    const path = fixZipName(rawPath)
    if (path.endsWith("/")) continue

    const base = path.slice(path.lastIndexOf("/") + 1)

    if (path.startsWith("__MACOSX/") || path.includes("/__MACOSX/")) {
      skipped.push({ path, reason: "macOS metadata" })
      continue
    }

    if (base.startsWith(".")) {
      skipped.push({ path, reason: "hidden file" })
      continue
    }

    entries.push({ path, text: strFromU8(data).replace(/^﻿/, "") })
  }

  return { entries, skipped }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test test/zip-entries.test.mjs`
Expected: 8 passing. If the flag-clearing test fails, print `Object.keys(unzipSync(zip))` inside the test to see what fflate produced and adjust `clearUtf8Flags` offsets; the local header flag field is at byte offset 6 from the `PK\3\4` signature and the central directory flag field is at offset 8 from `PK\1\2`.

- [x] **Step 5: Format and commit**

```bash
npx prettier --write res/js/src/zip-entries.mjs test/zip-entries.test.mjs
git add res/js/src/zip-entries.mjs test/zip-entries.test.mjs
git commit -m "Decode zip entries, repairing GuidedTrack's unflagged UTF-8 names"
```

---

### Task 5: Build the program graph

**Files:**
- Create: `res/js/src/graph.mjs`
- Test: `test/graph.test.mjs`

**Interfaces:**
- Consumes: `parseReferences(text)` from Task 2.
- Produces: `buildGraph(files: Array<{ name: string, path?: string, text: string }>, options?: { skipped?: Array<{ path, reason }> }) -> { nodes: Map<string, { name, inZip: boolean, dynamic: boolean }>, edges: Array<{ from, to, kind: "program" | "switch", count: number }>, warnings: Array<{ type: "external" | "dynamic" | "duplicate" | "skipped", message: string }> }`.
  - `files[i].name` is the program name (already derived by Task 3). `path` defaults to `name` and is used only in messages.
  - Edges are deduplicated on `(from, to, kind)`; `count` is how many source lines produced the edge.
  - When two files share a name the first wins and a `duplicate` warning is added.

- [x] **Step 1: Write the failing tests**

Create `test/graph.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildGraph } from "../res/js/src/graph.mjs"

const nodeList = graph =>
  [...graph.nodes.values()].sort((a, b) => (a.name < b.name ? -1 : 1))

test("two files, one call", () => {
  const graph = buildGraph([
    {
      name: "program_a",
      text: "Hello, world!\n*question: How are you today?\n*program: program_b\n",
    },
    { name: "program_b", text: "Welcome!\n*question: What's your name?\n" },
  ])
  assert.deepEqual(nodeList(graph), [
    { name: "program_a", inZip: true, dynamic: false },
    { name: "program_b", inZip: true, dynamic: false },
  ])
  assert.deepEqual(graph.edges, [
    { from: "program_a", to: "program_b", kind: "program", count: 1 },
  ])
  assert.deepEqual(graph.warnings, [])
})

test("repeated calls collapse into one edge with a count", () => {
  const graph = buildGraph([
    { name: "a", text: "*program: b\n*program: b\n\t*program: b\n" },
    { name: "b", text: "" },
  ])
  assert.deepEqual(graph.edges, [
    { from: "a", to: "b", kind: "program", count: 3 },
  ])
})

test("program and switch to the same target are separate edges", () => {
  const graph = buildGraph([
    { name: "a", text: "*program: b\n*switch: b\n" },
    { name: "b", text: "" },
  ])
  assert.deepEqual(graph.edges, [
    { from: "a", to: "b", kind: "program", count: 1 },
    { from: "a", to: "b", kind: "switch", count: 1 },
  ])
})

test("a referenced program missing from the zip becomes an external node with a warning", () => {
  const graph = buildGraph([
    { name: "a", text: "*program: general consent form - public\n" },
    { name: "c", text: "*program: general consent form - public\n" },
  ])
  assert.deepEqual(graph.nodes.get("general consent form - public"), {
    name: "general consent form - public",
    inZip: false,
    dynamic: false,
  })
  assert.deepEqual(graph.warnings, [
    {
      type: "external",
      message:
        '"general consent form - public" is referenced by a, c but is not in the zip.',
    },
  ])
})

test("an interpolated target becomes a dynamic node with a warning", () => {
  const graph = buildGraph([
    { name: "a", path: "zip/a", text: "x\n*program: {nextProgram}\n" },
  ])
  assert.deepEqual(graph.nodes.get("{nextProgram}"), {
    name: "{nextProgram}",
    inZip: false,
    dynamic: true,
  })
  assert.deepEqual(graph.edges, [
    { from: "a", to: "{nextProgram}", kind: "program", count: 1 },
  ])
  assert.deepEqual(graph.warnings, [
    {
      type: "dynamic",
      message:
        '"{nextProgram}" in a (line 2) contains a variable, so the target cannot be resolved.',
    },
  ])
})

test("duplicate program names keep the first file and warn", () => {
  const graph = buildGraph([
    { name: "a", path: "one/a", text: "*program: b\n" },
    { name: "a", path: "two/a", text: "*program: c\n" },
  ])
  assert.deepEqual(
    graph.edges.map(e => e.to),
    ["b"],
  )
  assert.deepEqual(graph.warnings[0], {
    type: "duplicate",
    message:
      'Two files map to program "a" (one/a and two/a); using the first.',
  })
})

test("isolated programs are still nodes", () => {
  const graph = buildGraph([{ name: "lonely", text: "Just text\n" }])
  assert.deepEqual(nodeList(graph), [
    { name: "lonely", inZip: true, dynamic: false },
  ])
  assert.deepEqual(graph.edges, [])
})

test("a self call is an edge from a program to itself", () => {
  const graph = buildGraph([{ name: "a", text: "*program: a\n" }])
  assert.deepEqual(graph.edges, [
    { from: "a", to: "a", kind: "program", count: 1 },
  ])
})

test("skipped entries become warnings", () => {
  const graph = buildGraph([], {
    skipped: [{ path: "z/.DS_Store", reason: "hidden file" }],
  })
  assert.deepEqual(graph.warnings, [
    { type: "skipped", message: "Skipped z/.DS_Store: hidden file." },
  ])
})

test("warnings are ordered duplicate, dynamic, external, skipped", () => {
  const graph = buildGraph(
    [
      { name: "a", text: "*program: {v}\n*program: missing\n" },
      { name: "a", text: "" },
    ],
    { skipped: [{ path: "x", reason: "hidden file" }] },
  )
  assert.deepEqual(
    graph.warnings.map(w => w.type),
    ["duplicate", "dynamic", "external", "skipped"],
  )
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test test/graph.test.mjs`
Expected: FAIL with `Cannot find module`.

- [x] **Step 3: Implement**

Create `res/js/src/graph.mjs`:

```js
import { parseReferences } from "./parse.mjs"

const DYNAMIC = /\{.*\}/

export function buildGraph(files, { skipped = [] } = {}) {
  const nodes = new Map()
  const edgesByKey = new Map()
  const pathByName = new Map()
  const duplicates = []
  const dynamics = []
  const callersByExternal = new Map()
  const kept = []

  for (const file of files) {
    const path = file.path ?? file.name

    if (nodes.has(file.name)) {
      duplicates.push({
        type: "duplicate",
        message: `Two files map to program "${file.name}" (${pathByName.get(file.name)} and ${path}); using the first.`,
      })
      continue
    }

    nodes.set(file.name, { name: file.name, inZip: true, dynamic: false })
    pathByName.set(file.name, path)
    kept.push(file)
  }

  for (const file of kept) {
    for (const ref of parseReferences(file.text)) {
      const { target, kind, line } = ref

      if (!nodes.has(target)) {
        const dynamic = DYNAMIC.test(target)
        nodes.set(target, { name: target, inZip: false, dynamic })

        if (!dynamic) callersByExternal.set(target, new Set())
      }

      const node = nodes.get(target)

      if (node.dynamic) {
        dynamics.push({
          type: "dynamic",
          message: `"${target}" in ${file.name} (line ${line}) contains a variable, so the target cannot be resolved.`,
        })
      } else if (!node.inZip) {
        callersByExternal.get(target).add(file.name)
      }

      const key = [file.name, target, kind].join("\u0000")
      const edge = edgesByKey.get(key)

      if (edge) {
        edge.count++
      } else {
        edgesByKey.set(key, { from: file.name, to: target, kind, count: 1 })
      }
    }
  }

  const externals = [...callersByExternal].map(([target, callers]) => ({
    type: "external",
    message: `"${target}" is referenced by ${[...callers].join(", ")} but is not in the zip.`,
  }))

  const skips = skipped.map(s => ({
    type: "skipped",
    message: `Skipped ${s.path}: ${s.reason}.`,
  }))

  return {
    nodes,
    edges: [...edgesByKey.values()],
    warnings: [...duplicates, ...dynamics, ...externals, ...skips],
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test test/graph.test.mjs`
Expected: 10 passing.

- [x] **Step 5: Format and commit**

```bash
npx prettier --write res/js/src/graph.mjs test/graph.test.mjs
git add res/js/src/graph.mjs test/graph.test.mjs
git commit -m "Build the program call graph with external and dynamic nodes"
```

---

### Task 6: Emit Mermaid

**Files:**
- Create: `res/js/src/mermaid.mjs`
- Test: `test/mermaid.test.mjs`

**Interfaces:**
- Consumes: the `graph` shape from Task 5.
- Produces:
  - `escapeLabel(text: string) -> string`: `&` → `&amp;`, `"` → `&quot;`, `<` → `&lt;`, `>` → `&gt;` (in that order, `&` first).
  - `toMermaid(graph, options?: { direction?: "TD" | "LR" }) -> string`. Throws `RangeError` for any other direction.

- [x] **Step 1: Write the failing tests**

Create `test/mermaid.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildGraph } from "../res/js/src/graph.mjs"
import { escapeLabel, toMermaid } from "../res/js/src/mermaid.mjs"

test("the two-file example from the request", () => {
  const graph = buildGraph([
    { name: "program_a", text: "Hello\n*question: Q?\n*program: program_b\n" },
    { name: "program_b", text: "Welcome!\n" },
  ])
  assert.equal(
    toMermaid(graph),
    [
      "flowchart TD",
      '    n0["program_a"]',
      '    n1["program_b"]',
      "    n0 --> n1",
    ].join("\n"),
  )
})

test("direction LR", () => {
  const graph = buildGraph([{ name: "a", text: "" }])
  assert.equal(
    toMermaid(graph, { direction: "LR" }),
    'flowchart LR\n    n0["a"]',
  )
})

test("rejects an unknown direction", () => {
  const graph = buildGraph([{ name: "a", text: "" }])
  assert.throws(() => toMermaid(graph, { direction: "BT" }), RangeError)
})

test("node ids follow code-point order of names, not file order", () => {
  const graph = buildGraph([
    { name: "zeta", text: "*program: alpha\n" },
    { name: "alpha", text: "" },
    { name: "Beta", text: "" },
  ])
  assert.equal(
    toMermaid(graph),
    [
      "flowchart TD",
      '    n0["Beta"]',
      '    n1["alpha"]',
      '    n2["zeta"]',
      "    n2 --> n1",
    ].join("\n"),
  )
})

test("external and dynamic nodes get classes and classDefs only when present", () => {
  const graph = buildGraph([
    { name: "a", text: "*program: missing\n*program: {v}\n" },
  ])
  assert.equal(
    toMermaid(graph),
    [
      "flowchart TD",
      '    n0["a"]',
      '    n1["missing"]:::external',
      '    n2["{v}"]:::dynamic',
      "    n0 --> n1",
      "    n0 --> n2",
      "    classDef external stroke-dasharray: 5 5",
      "    classDef dynamic stroke-dasharray: 2 2",
    ].join("\n"),
  )
})

test("only the external classDef appears when there are no dynamic nodes", () => {
  const graph = buildGraph([{ name: "a", text: "*program: missing\n" }])
  const out = toMermaid(graph)
  assert.ok(out.endsWith("    classDef external stroke-dasharray: 5 5"))
  assert.ok(!out.includes("classDef dynamic"))
})

test("switch edges are dotted and labelled", () => {
  const graph = buildGraph([
    { name: "a", text: "*switch: b\n*program: b\n" },
    { name: "b", text: "" },
  ])
  assert.equal(
    toMermaid(graph),
    [
      "flowchart TD",
      '    n0["a"]',
      '    n1["b"]',
      "    n0 --> n1",
      "    n0 -. switch .-> n1",
    ].join("\n"),
  )
})

test("edges are sorted by source id, then target id, then kind", () => {
  const graph = buildGraph([
    { name: "c", text: "*program: a\n" },
    { name: "b", text: "*program: c\n*program: a\n" },
    { name: "a", text: "" },
  ])
  assert.deepEqual(
    toMermaid(graph).split("\n").slice(4),
    ["    n1 --> n0", "    n1 --> n2", "    n2 --> n0"],
  )
})

test("labels escape HTML-significant characters", () => {
  assert.equal(escapeLabel('say "hi" <b> & c'), "say &quot;hi&quot; &lt;b&gt; &amp; c")
  assert.equal(escapeLabel("&amp;"), "&amp;amp;")
  assert.equal(
    escapeLabel("Clearer Thinking | Report Errors (v2) [x] {y} #1 @me/you"),
    "Clearer Thinking | Report Errors (v2) [x] {y} #1 @me/you",
  )
})

test("labels are escaped in the output", () => {
  const graph = buildGraph([{ name: 'a "b"', text: "" }])
  assert.equal(toMermaid(graph), 'flowchart TD\n    n0["a &quot;b&quot;"]')
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `node --test test/mermaid.test.mjs`
Expected: FAIL with `Cannot find module`.

- [x] **Step 3: Implement**

Create `res/js/src/mermaid.mjs`:

```js
// Turns a program graph into Mermaid flowchart text.
// Labels use HTML entities: Mermaid 12.2's own "#quot;" codes render as
// placeholder garbage, while &quot; / &lt; / &gt; / &amp; render correctly.

const DIRECTIONS = new Set(["TD", "LR"])

export function escapeLabel(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export function toMermaid(graph, { direction = "TD" } = {}) {
  if (!DIRECTIONS.has(direction)) {
    throw new RangeError(`Unsupported direction "${direction}"; use TD or LR`)
  }

  const names = [...graph.nodes.keys()].sort(byCodePoint)
  const ids = new Map(names.map((name, i) => [name, `n${i}`]))
  const lines = [`flowchart ${direction}`]
  let hasExternal = false
  let hasDynamic = false

  for (const name of names) {
    const node = graph.nodes.get(name)
    let line = `    ${ids.get(name)}["${escapeLabel(name)}"]`

    if (node.dynamic) {
      line += ":::dynamic"
      hasDynamic = true
    } else if (!node.inZip) {
      line += ":::external"
      hasExternal = true
    }

    lines.push(line)
  }

  const index = id => Number(id.slice(1))

  const edges = [...graph.edges].sort((a, b) => {
    const fa = index(ids.get(a.from))
    const fb = index(ids.get(b.from))
    if (fa !== fb) return fa - fb
    const ta = index(ids.get(a.to))
    const tb = index(ids.get(b.to))
    if (ta !== tb) return ta - tb
    return byCodePoint(a.kind, b.kind)
  })

  for (const edge of edges) {
    const from = ids.get(edge.from)
    const to = ids.get(edge.to)
    lines.push(
      edge.kind === "switch"
        ? `    ${from} -. switch .-> ${to}`
        : `    ${from} --> ${to}`,
    )
  }

  if (hasExternal) lines.push("    classDef external stroke-dasharray: 5 5")
  if (hasDynamic) lines.push("    classDef dynamic stroke-dasharray: 2 2")

  return lines.join("\n")
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `node --test test/mermaid.test.mjs`
Expected: 10 passing. Then run `pnpm test` and expect every test file passing.

- [x] **Step 5: Format and commit**

```bash
npx prettier --write res/js/src/mermaid.mjs test/mermaid.test.mjs
git add res/js/src/mermaid.mjs test/mermaid.test.mjs
git commit -m "Emit deterministic Mermaid flowchart text from the program graph"
```

---

### Task 7: The page

**Files:**
- Modify: `index.html` (replace entirely)
- Modify: `res/css/global.css` (replace entirely)
- Modify: `res/js/src/main.mjs` (replace entirely)
- Modify: `res/js/bundle.js` (build output)

**Interfaces:**
- Consumes: `entriesFromZip`, `programNameFromPath`, `buildGraph`, `toMermaid`, `mermaid` (default export of the `mermaid` package).
- Produces: element ids the e2e test (Task 8) relies on: `#file-input`, `#drop-zone`, `#direction`, `#results`, `#diagram`, `#source`, `#copy`, `#download`, `#warnings`, `#warnings-list`, `#error`, `#summary`.

- [x] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta content="width=device-width, initial-scale=1" name="viewport" />
    <title>GuidedTrack Program Flow</title>
    <link href="res/css/global.css" rel="stylesheet" type="text/css" />
  </head>
  <body>
    <main>
      <h1>GuidedTrack Program Flow</h1>

      <p>
        Upload the zip of program source files that GuidedTrack's
        <em>Package code</em> button produces, and get a Mermaid flowchart of
        which programs call which. Only <code>*program:</code> and
        <code>*switch:</code> lines are read; nothing else in your programs is
        represented. The zip is processed entirely in your browser and never
        leaves your computer.
      </p>

      <label id="drop-zone" class="drop-zone" for="file-input">
        <strong>Drop a zip here</strong> or click to choose one
        <input id="file-input" type="file" accept=".zip,application/zip" />
      </label>

      <div id="error" class="error" hidden></div>

      <section id="results" hidden>
        <div class="toolbar">
          <span id="summary"></span>
          <label>
            Direction
            <select id="direction">
              <option value="TD">Top to bottom</option>
              <option value="LR">Left to right</option>
            </select>
          </label>
        </div>

        <div id="diagram" class="diagram"></div>

        <ul class="legend">
          <li><span class="swatch solid"></span> program in the zip</li>
          <li><span class="swatch dashed"></span> referenced, not in the zip</li>
          <li><span class="swatch dotted"></span> variable name, unresolved</li>
          <li><span class="edge solid"></span> <code>*program:</code> call</li>
          <li><span class="edge dotted"></span> <code>*switch:</code> transfer</li>
        </ul>

        <section id="warnings" hidden>
          <h2>Notes</h2>
          <ul id="warnings-list"></ul>
        </section>

        <section>
          <div class="toolbar">
            <h2>Mermaid source</h2>
            <span>
              <button id="copy" type="button">Copy</button>
              <button id="download" type="button">Download .mmd</button>
            </span>
          </div>
          <textarea id="source" readonly rows="16" spellcheck="false"></textarea>
        </section>
      </section>
    </main>

    <script src="res/js/bundle.js"></script>
  </body>
</html>
```

- [x] **Step 2: Write `res/css/global.css`**

```css
:root {
  --bg: #ffffff;
  --fg: #1c1c1c;
  --muted: #5c5c5c;
  --border: #c9c9c9;
  --accent: #2456c4;
  --accent-bg: #eef2fc;
  --error-bg: #fbe9e9;
  --error-fg: #8a1c1c;
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161616;
    --fg: #ececec;
    --muted: #a5a5a5;
    --border: #4a4a4a;
    --accent: #7fa4ff;
    --accent-bg: #1f2740;
    --error-bg: #3a1c1c;
    --error-fg: #ffb3b3;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    sans-serif;
  line-height: 1.5;
}

main {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

h1 {
  margin: 0 0 8px;
  font-size: 1.6rem;
}

h2 {
  margin: 0;
  font-size: 1.1rem;
}

code {
  font-size: 0.95em;
}

.drop-zone {
  display: block;
  margin: 24px 0;
  padding: 40px 16px;
  border: 2px dashed var(--border);
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
}

.drop-zone:hover,
.drop-zone:focus-within,
.drop-zone.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}

.drop-zone input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.error {
  margin: 16px 0;
  padding: 12px 16px;
  border-radius: 6px;
  background: var(--error-bg);
  color: var(--error-fg);
  white-space: pre-wrap;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px;
}

.diagram {
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #ffffff;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin: 8px 0 16px;
  padding: 0;
  list-style: none;
  font-size: 0.9rem;
  color: var(--muted);
}

.legend li {
  display: flex;
  gap: 6px;
  align-items: center;
}

.swatch {
  display: inline-block;
  width: 22px;
  height: 14px;
  border: 2px solid currentColor;
  border-radius: 3px;
}

.swatch.dashed {
  border-style: dashed;
}

.swatch.dotted {
  border-style: dotted;
}

.edge {
  display: inline-block;
  width: 26px;
  border-top: 2px solid currentColor;
}

.edge.dotted {
  border-top-style: dotted;
}

#warnings {
  margin: 0 0 16px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

#warnings ul {
  margin: 8px 0 0;
  padding-left: 20px;
}

textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85rem;
  resize: vertical;
}

button {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  font: inherit;
  cursor: pointer;
}

button:hover {
  border-color: var(--accent);
}

select {
  font: inherit;
  padding: 4px 8px;
}
```

- [x] **Step 3: Write `res/js/src/main.mjs`**

```js
import mermaid from "mermaid"
import { buildGraph } from "./graph.mjs"
import { toMermaid } from "./mermaid.mjs"
import { programNameFromPath } from "./program-name.mjs"
import { entriesFromZip } from "./zip-entries.mjs"

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  maxEdges: 10000,
  maxTextSize: 10_000_000,
})

const $ = id => document.getElementById(id)

const state = { graph: null, source: "", baseName: "program-flow" }
let renderCount = 0

function showError(message) {
  $("error").textContent = message
  $("error").hidden = false
}

function clearError() {
  $("error").hidden = true
  $("error").textContent = ""
}

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

async function render() {
  const direction = $("direction").value
  state.source = toMermaid(state.graph, { direction })
  $("source").value = state.source

  try {
    const { svg } = await mermaid.render(
      `program-flow-${++renderCount}`,
      state.source,
    )
    $("diagram").innerHTML = svg
  } catch (error) {
    $("diagram").innerHTML = ""
    showError(
      `Mermaid could not render the diagram:\n${error.message}\n\nThe Mermaid source below is still available.`,
    )
  }
}

async function handleFile(file) {
  clearError()
  $("results").hidden = true

  let bytes
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch (error) {
    showError(`Could not read the file: ${error.message}`)
    return
  }

  let entries
  let skipped
  try {
    ;({ entries, skipped } = entriesFromZip(bytes))
  } catch {
    showError("Could not read this file as a zip.")
    return
  }

  if (entries.length === 0) {
    showError("No program files found in this zip.")
    return
  }

  const files = entries.map(e => ({
    name: programNameFromPath(e.path),
    path: e.path,
    text: e.text,
  }))

  state.graph = buildGraph(files, { skipped })
  state.baseName = file.name.replace(/\.zip$/i, "") || "program-flow"

  const inZip = [...state.graph.nodes.values()].filter(n => n.inZip).length
  const external = state.graph.nodes.size - inZip
  $("summary").textContent =
    `${pluralize(inZip, "program")} in the zip, ` +
    `${pluralize(external, "external reference")}, ` +
    `${pluralize(state.graph.edges.length, "edge")}.`

  const list = $("warnings-list")
  list.innerHTML = ""
  for (const warning of state.graph.warnings) {
    const li = document.createElement("li")
    li.textContent = warning.message
    list.appendChild(li)
  }
  $("warnings").hidden = state.graph.warnings.length === 0

  $("results").hidden = false
  await render()
}

$("file-input").addEventListener("change", event => {
  const file = event.target.files[0]
  if (file) handleFile(file)
})

const dropZone = $("drop-zone")

for (const type of ["dragenter", "dragover"]) {
  dropZone.addEventListener(type, event => {
    event.preventDefault()
    dropZone.classList.add("active")
  })
}

for (const type of ["dragleave", "drop"]) {
  dropZone.addEventListener(type, event => {
    event.preventDefault()
    dropZone.classList.remove("active")
  })
}

dropZone.addEventListener("drop", event => {
  const file = event.dataTransfer?.files?.[0]
  if (file) handleFile(file)
})

$("direction").addEventListener("change", () => {
  if (state.graph) render()
})

$("copy").addEventListener("click", async () => {
  const button = $("copy")
  try {
    await navigator.clipboard.writeText(state.source)
    button.textContent = "Copied"
  } catch {
    $("source").select()
    button.textContent = "Select and copy manually"
  }
  setTimeout(() => (button.textContent = "Copy"), 1500)
})

$("download").addEventListener("click", () => {
  const blob = new Blob([state.source], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${state.baseName}.mmd`
  a.click()
  URL.revokeObjectURL(url)
})
```

- [x] **Step 4: Build and lint**

Run: `pnpm build`
Expected: `Done! 🎉` and `res/js/bundle.js` around 5 MB.

Run: `npx prettier --write index.html res/css/global.css res/js/src/main.mjs && pnpm lint`
Expected: clean.

- [x] **Step 5: Verify in headless Chromium with the real zip**

Write a throwaway script in the scratchpad (not the repo) that starts `python3 -m http.server` on a free port in the workspace, opens the page with Playwright, calls `page.setInputFiles("#file-input", "/home/ubuntu/workspace/attractiveness_face_preferences_study_dating_app.zip")`, waits for `#diagram svg`, screenshots the page to the scratchpad, and prints: the `#summary` text, the number of `.nodeLabel` elements, whether any label contains `â` or `∕` (both must be false), the first 12 lines of `#source`, and `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at a 390px-wide viewport. Read the screenshot back and look at it.

Expected: 38 programs in the zip, 10 external references, no mojibake labels, no horizontal page overflow at phone width (the diagram container itself may scroll internally).

- [x] **Step 6: Commit**

```bash
git add index.html res/css/global.css res/js/src/main.mjs res/js/bundle.js
git commit -m "Add the upload page: drop zone, rendered diagram, source, warnings"
```

---

### Task 8: End-to-end test and optional real-zip test

**Files:**
- Create: `test/e2e.test.mjs`
- Create: `test/real-zip.test.mjs`

**Interfaces:**
- Consumes: element ids from Task 7; `res/js/bundle.js` must be built.
- Produces: tests that skip, with a stated reason, when Playwright is not importable or the bundle is missing; the real-zip test skips unless `GT_SAMPLE_ZIP` points at a file.

- [x] **Step 1: Write the e2e test**

Create `test/e2e.test.mjs`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { strToU8, zipSync } from "fflate"

const root = process.cwd()
const bundleBuilt = fs.existsSync(path.join(root, "res/js/bundle.js"))

let chromium = null
try {
  ;({ chromium } = await import("playwright"))
} catch {
  // Playwright is optional; the test below is skipped without it.
}

const skip = !chromium
  ? "playwright is not installed"
  : !bundleBuilt
    ? "run pnpm build first"
    : false

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
}

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, req.url === "/" ? "index.html" : req.url)
    try {
      res.setHeader("content-type", TYPES[path.extname(file)] ?? "text/plain")
      res.end(fs.readFileSync(file))
    } catch {
      res.statusCode = 404
      res.end()
    }
  })
  return new Promise(resolve =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }),
    ),
  )
}

const EXPECTED_SOURCE = [
  "flowchart TD",
  '    n0["Clearer Thinking | Report Errors"]:::external',
  '    n1["program_a"]',
  '    n2["program_b"]',
  "    n1 --> n0",
  "    n1 --> n2",
  "    n2 -. switch .-> n1",
  "    classDef external stroke-dasharray: 5 5",
].join("\n")

test("uploading a zip renders a diagram and the Mermaid source", { skip }, async () => {
  const zip = zipSync({
    "my_programs/program_a": strToU8(
      "Hello, world!\n*question: How are you today?\n*program: program_b\n*program: Clearer Thinking | Report Errors\n",
    ),
    "my_programs/program_b": strToU8("Welcome!\r\n*switch: program_a\r\n"),
  })

  const { server, url } = await serve()
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
    const errors = []
    page.on("pageerror", e => errors.push(e.message))
    await page.goto(url)

    await page.setInputFiles("#file-input", {
      name: "my_programs.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    })

    await page.waitForSelector("#diagram svg")

    const labels = await page.$$eval("#diagram .nodeLabel", els =>
      els.map(e => e.textContent).sort(),
    )
    assert.deepEqual(labels, [
      "Clearer Thinking | Report Errors",
      "program_a",
      "program_b",
    ])

    assert.equal(await page.inputValue("#source"), EXPECTED_SOURCE)
    assert.equal(
      await page.textContent("#summary"),
      "2 programs in the zip, 1 external reference, 3 edges.",
    )
    assert.match(
      await page.textContent("#warnings-list"),
      /"Clearer Thinking \| Report Errors" is referenced by program_a but is not in the zip\./,
    )

    await page.selectOption("#direction", "LR")
    await page.waitForFunction(
      () => document.getElementById("source").value.startsWith("flowchart LR"),
    )

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    )
    assert.equal(overflow, false, "page should not scroll horizontally")
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    server.close()
  }
})

test("a non-zip file shows an error", { skip }, async () => {
  const { server, url } = await serve()
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    await page.goto(url)
    await page.setInputFiles("#file-input", {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a zip"),
    })
    await page.waitForSelector("#error:not([hidden])")
    assert.equal(
      await page.textContent("#error"),
      "Could not read this file as a zip.",
    )
  } finally {
    await browser.close()
    server.close()
  }
})
```

- [x] **Step 2: Write the optional real-zip test**

Create `test/real-zip.test.mjs`:

```js
// Runs only when GT_SAMPLE_ZIP points at a real "Package code" download.
// Example: GT_SAMPLE_ZIP=./my_programs.zip pnpm test
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { buildGraph } from "../res/js/src/graph.mjs"
import { toMermaid } from "../res/js/src/mermaid.mjs"
import { programNameFromPath } from "../res/js/src/program-name.mjs"
import { entriesFromZip } from "../res/js/src/zip-entries.mjs"

const zipPath = process.env.GT_SAMPLE_ZIP
const skip =
  zipPath && fs.existsSync(zipPath) ? false : "GT_SAMPLE_ZIP is not set"

test("a real GuidedTrack zip produces clean names and a graph", { skip }, () => {
  const { entries, skipped } = entriesFromZip(new Uint8Array(fs.readFileSync(zipPath)))
  const files = entries.map(e => ({
    name: programNameFromPath(e.path),
    path: e.path,
    text: e.text,
  }))
  const graph = buildGraph(files, { skipped })

  assert.ok(entries.length > 0, "zip has program files")
  for (const name of graph.nodes.keys()) {
    assert.ok(!name.includes("â"), `mojibake in "${name}"`)
    assert.ok(!name.includes("∕"), `division slash left in "${name}"`)
  }
  assert.ok(!graph.warnings.some(w => w.type === "duplicate"))
  assert.equal(
    [...graph.nodes.values()].filter(n => n.inZip).length,
    entries.length,
  )
  assert.ok(toMermaid(graph).startsWith("flowchart TD\n"))
})
```

- [x] **Step 3: Run the whole suite both ways**

Run: `pnpm test`
Expected: all unit tests pass; the two e2e tests pass (Playwright is present in the container); the real-zip test reports skipped.

Run: `GT_SAMPLE_ZIP=./attractiveness_face_preferences_study_dating_app.zip pnpm test`
Expected: real-zip test passes too.

Run: `npx prettier --write test && pnpm lint`
Expected: clean.

- [x] **Step 4: Commit**

```bash
git add test/e2e.test.mjs test/real-zip.test.mjs
git commit -m "Add end-to-end browser test and optional real-zip check"
```

---

### Task 9: Documentation

**Files:**
- Create: `README.md`
- Create: `CLAUDE.md`

- [x] **Step 1: Write `README.md`**

````markdown
# GuidedTrack Program Flow

A static web page that takes the zip of program source files produced by GuidedTrack's **Package code** button and draws a [Mermaid](https://mermaid.js.org/) flowchart of which programs call which. Only `*program:` (call and return) and `*switch:` (transfer without return) lines are read. Everything runs in the browser; the zip never leaves your computer.

## Use

Open `index.html` from any static host (or `pnpm serve` and visit `http://localhost:8000/`), drop the zip on the page, and you get:

- the rendered diagram, with a top-to-bottom / left-to-right toggle;
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
````

- [x] **Step 2: Write `CLAUDE.md`**

````markdown
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
- `*.zip` is gitignored on purpose: sample zips contain the user's program source.

## Commands

`pnpm build`, `pnpm watch`, `pnpm serve`, `pnpm test`, `pnpm lint`. Real-zip check: `GT_SAMPLE_ZIP=./some.zip pnpm test`.
````

- [x] **Step 3: Lint and commit**

Run: `npx prettier --write README.md CLAUDE.md && pnpm lint`
Expected: clean (the markdown ESLint plugin will flag any heading not followed by a blank line; fix if so).

```bash
git add README.md CLAUDE.md
git commit -m "Document usage, development, and the zip format quirks"
```

---

### Task 10: Final verification

- [x] **Step 1: Fresh build and full checks**

```bash
pnpm build && pnpm lint && GT_SAMPLE_ZIP=./attractiveness_face_preferences_study_dating_app.zip pnpm test
```

Expected: build succeeds, lint clean, every test passes, none failing. Record the pass/fail counts.

- [x] **Step 2: Confirm the working tree is clean and the zip is untracked**

```bash
git status --short
git check-ignore -v attractiveness_face_preferences_study_dating_app.zip
```

Expected: no modified files; the zip is matched by the `*.zip` rule.

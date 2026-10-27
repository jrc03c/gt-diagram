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

test(
  "a real GuidedTrack zip produces clean names and a graph",
  { skip },
  () => {
    const { entries, skipped } = entriesFromZip(
      new Uint8Array(fs.readFileSync(zipPath)),
    )
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
  },
)

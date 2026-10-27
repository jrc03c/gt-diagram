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
  assert.deepEqual(toMermaid(graph).split("\n").slice(4), [
    "    n1 --> n0",
    "    n1 --> n2",
    "    n2 --> n0",
  ])
})

test("labels escape HTML-significant characters", () => {
  assert.equal(
    escapeLabel('say "hi" <b> & c'),
    "say &quot;hi&quot; &lt;b&gt; &amp; c",
  )
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

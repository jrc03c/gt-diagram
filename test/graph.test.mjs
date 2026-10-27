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
    { name: "program_a", inZip: true },
    { name: "program_b", inZip: true },
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
  })
  assert.deepEqual(graph.warnings, [
    {
      type: "external",
      message:
        '"general consent form - public" is referenced by a, c but is not in the zip.',
    },
  ])
})

test("a target with braces is a literal name, so it is just an external node", () => {
  const graph = buildGraph([
    { name: "a", path: "zip/a", text: "x\n*program: {nextProgram}\n" },
  ])
  assert.deepEqual(graph.nodes.get("{nextProgram}"), {
    name: "{nextProgram}",
    inZip: false,
  })
  assert.deepEqual(graph.edges, [
    { from: "a", to: "{nextProgram}", kind: "program", count: 1 },
  ])
  assert.deepEqual(graph.warnings, [
    {
      type: "external",
      message: '"{nextProgram}" is referenced by a but is not in the zip.',
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
    message: 'Two files map to program "a" (one/a and two/a); using the first.',
  })
})

test("isolated programs are still nodes", () => {
  const graph = buildGraph([{ name: "lonely", text: "Just text\n" }])
  assert.deepEqual(nodeList(graph), [{ name: "lonely", inZip: true }])
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

test("warnings are ordered duplicate, external, skipped", () => {
  const graph = buildGraph(
    [
      { name: "a", text: "*program: missing\n" },
      { name: "a", text: "" },
    ],
    { skipped: [{ path: "x", reason: "hidden file" }] },
  )
  assert.deepEqual(
    graph.warnings.map(w => w.type),
    ["duplicate", "external", "skipped"],
  )
})

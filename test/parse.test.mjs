import { test } from "node:test"
import assert from "node:assert/strict"
import { parseReferences } from "../res/js/src/parse.mjs"

test("finds a top-level *program: call with its line number", () => {
  const text =
    "Hello, world!\n*question: How are you today?\n*program: program_b\n"
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
  const text =
    "-- *program: old thing\n--*program: other\n\t-- *program: nested\n*program: real\n"
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
  const text =
    "*programme: nope\nThe *program: keyword is nice\n*question: *program: x\n"
  assert.deepEqual(parseReferences(text), [])
})

test("returns an empty array for empty input", () => {
  assert.deepEqual(parseReferences(""), [])
})

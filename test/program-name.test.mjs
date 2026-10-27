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

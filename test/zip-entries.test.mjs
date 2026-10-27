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
  const zip = clearUtf8Flags(zipSync({ "z/@jrc03c∕show-error": strToU8("x") }))
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

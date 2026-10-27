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

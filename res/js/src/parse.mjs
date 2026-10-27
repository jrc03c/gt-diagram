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

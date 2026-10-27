import { parseReferences } from "./parse.mjs"

export function buildGraph(files, { skipped = [] } = {}) {
  const nodes = new Map()
  const edgesByKey = new Map()
  const pathByName = new Map()
  const duplicates = []
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

    nodes.set(file.name, { name: file.name, inZip: true })
    pathByName.set(file.name, path)
    kept.push(file)
  }

  for (const file of kept) {
    for (const ref of parseReferences(file.text)) {
      const { target, kind } = ref

      if (!nodes.has(target)) {
        nodes.set(target, { name: target, inZip: false })
        callersByExternal.set(target, new Set())
      }

      if (!nodes.get(target).inZip) {
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
    warnings: [...duplicates, ...externals, ...skips],
  }
}

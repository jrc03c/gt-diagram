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

import mermaid from "mermaid"
import { buildGraph } from "./graph.mjs"
import { toMermaid } from "./mermaid.mjs"
import { programNameFromPath } from "./program-name.mjs"
import { entriesFromZip } from "./zip-entries.mjs"

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  maxEdges: 10000,
  maxTextSize: 10_000_000,
})

const $ = id => document.getElementById(id)

const state = { graph: null, source: "", baseName: "program-flow" }
let renderCount = 0

function showError(message) {
  $("error").textContent = message
  $("error").hidden = false
}

function clearError() {
  $("error").hidden = true
  $("error").textContent = ""
}

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

// Mermaid sizes its SVG to fit the container, which makes a large graph
// unreadably small. By default show it at natural size and let the
// container scroll; "Fit to width" restores Mermaid's behaviour.
function sizeDiagram() {
  const svg = $("diagram").querySelector("svg")
  if (!svg) return

  if ($("fit").checked) {
    svg.removeAttribute("height")
    svg.setAttribute("width", "100%")
    svg.style.maxWidth = ""
    return
  }

  const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number)
  if (!viewBox || viewBox.length !== 4) return

  svg.setAttribute("width", Math.ceil(viewBox[2]))
  svg.setAttribute("height", Math.ceil(viewBox[3]))
  svg.style.maxWidth = "none"
}

async function render() {
  const direction = $("direction").value
  state.source = toMermaid(state.graph, { direction })
  $("source").value = state.source

  try {
    const { svg } = await mermaid.render(
      `program-flow-${++renderCount}`,
      state.source,
    )
    $("diagram").innerHTML = svg
    sizeDiagram()
  } catch (error) {
    $("diagram").innerHTML = ""
    showError(
      `Mermaid could not render the diagram:\n${error.message}\n\nThe Mermaid source below is still available.`,
    )
  }
}

async function handleFile(file) {
  clearError()
  $("results").hidden = true

  let bytes
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch (error) {
    showError(`Could not read the file: ${error.message}`)
    return
  }

  let entries
  let skipped
  try {
    ;({ entries, skipped } = entriesFromZip(bytes))
  } catch {
    showError("Could not read this file as a zip.")
    return
  }

  if (entries.length === 0) {
    showError("No program files found in this zip.")
    return
  }

  const files = entries.map(e => ({
    name: programNameFromPath(e.path),
    path: e.path,
    text: e.text,
  }))

  state.graph = buildGraph(files, { skipped })
  state.baseName = file.name.replace(/\.zip$/i, "") || "program-flow"

  const inZip = [...state.graph.nodes.values()].filter(n => n.inZip).length
  const external = state.graph.nodes.size - inZip
  $("summary").textContent =
    `${pluralize(inZip, "program")} in the zip, ` +
    `${pluralize(external, "external reference")}, ` +
    `${pluralize(state.graph.edges.length, "edge")}.`

  const list = $("warnings-list")
  list.innerHTML = ""
  for (const warning of state.graph.warnings) {
    const li = document.createElement("li")
    li.textContent = warning.message
    list.appendChild(li)
  }
  $("warnings").hidden = state.graph.warnings.length === 0

  $("results").hidden = false
  await render()
}

$("file-input").addEventListener("change", event => {
  const file = event.target.files[0]
  if (file) handleFile(file)
})

const dropZone = $("drop-zone")

for (const type of ["dragenter", "dragover"]) {
  dropZone.addEventListener(type, event => {
    event.preventDefault()
    dropZone.classList.add("active")
  })
}

for (const type of ["dragleave", "drop"]) {
  dropZone.addEventListener(type, event => {
    event.preventDefault()
    dropZone.classList.remove("active")
  })
}

dropZone.addEventListener("drop", event => {
  const file = event.dataTransfer?.files?.[0]
  if (file) handleFile(file)
})

$("direction").addEventListener("change", () => {
  if (state.graph) render()
})

$("fit").addEventListener("change", sizeDiagram)

$("copy").addEventListener("click", async () => {
  const button = $("copy")
  try {
    await navigator.clipboard.writeText(state.source)
    button.textContent = "Copied"
  } catch {
    $("source").select()
    button.textContent = "Select and copy manually"
  }
  setTimeout(() => (button.textContent = "Copy"), 1500)
})

$("download").addEventListener("click", () => {
  const blob = new Blob([state.source], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${state.baseName}.mmd`
  a.click()
  URL.revokeObjectURL(url)
})

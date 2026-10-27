import mermaid from "mermaid"
import { buildGraph } from "./graph.mjs"
import { toMermaid } from "./mermaid.mjs"
import { programNameFromPath } from "./program-name.mjs"
import { entriesFromZip } from "./zip-entries.mjs"

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  // Plain SVG text labels (not HTML in foreignObject) keep the exported
  // SVG portable and let the PNG export draw it onto a canvas.
  htmlLabels: false,
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

// In text-label mode Mermaid decodes &lt; &gt; &amp; but leaves &quot;
// literal, so restore double quotes in the rendered labels.
function fixQuotes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.includes("&quot;")) {
      node.nodeValue = node.nodeValue.replaceAll("&quot;", '"')
    }
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// A standalone copy of the rendered SVG at natural size, regardless of
// the "Fit to width" setting, with a white background.
function exportSvg() {
  const svg = $("diagram").querySelector("svg")
  if (!svg) return null

  const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number)
  if (!viewBox || viewBox.length !== 4) return null

  const width = Math.ceil(viewBox[2])
  const height = Math.ceil(viewBox[3])
  const clone = svg.cloneNode(true)
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", width)
  clone.setAttribute("height", height)
  clone.style.maxWidth = "none"
  clone.style.backgroundColor = "#ffffff"

  const text =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    new XMLSerializer().serializeToString(clone)

  return { text, width, height }
}

const MAX_CANVAS_SIDE = 16000

async function svgToPng({ text, width, height }) {
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }))

  try {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error("the SVG could not be loaded"))
      image.src = url
    })

    const scale = Math.min(2, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height)
    const canvas = document.createElement("canvas")
    canvas.width = Math.ceil(width * scale)
    canvas.height = Math.ceil(height * scale)

    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(scale, scale)
    ctx.drawImage(image, 0, 0)

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, "image/png"),
    )
    if (!blob) throw new Error("the browser could not encode a PNG this large")
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
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
    fixQuotes($("diagram"))
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
  downloadBlob(
    new Blob([state.source], { type: "text/plain" }),
    `${state.baseName}.mmd`,
  )
})

$("download-svg").addEventListener("click", () => {
  const exported = exportSvg()
  if (!exported) return
  downloadBlob(
    new Blob([exported.text], { type: "image/svg+xml" }),
    `${state.baseName}.svg`,
  )
})

$("download-png").addEventListener("click", async () => {
  const exported = exportSvg()
  if (!exported) return
  clearError()
  try {
    downloadBlob(await svgToPng(exported), `${state.baseName}.png`)
  } catch (error) {
    showError(`Could not create the PNG: ${error.message}.`)
  }
})

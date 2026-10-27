import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { strToU8, zipSync } from "fflate"

const root = process.cwd()
const bundleBuilt = fs.existsSync(path.join(root, "res/js/bundle.js"))

let chromium = null
try {
  ;({ chromium } = await import("playwright"))
} catch {
  // Playwright is optional; the tests below are skipped without it.
}

const skip = !chromium
  ? "playwright is not installed"
  : !bundleBuilt
    ? "run pnpm build first"
    : false

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
}

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, req.url === "/" ? "index.html" : req.url)
    try {
      res.setHeader("content-type", TYPES[path.extname(file)] ?? "text/plain")
      res.end(fs.readFileSync(file))
    } catch {
      res.statusCode = 404
      res.end()
    }
  })
  return new Promise(resolve =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }),
    ),
  )
}

const EXPECTED_SOURCE = [
  "flowchart TD",
  '    n0["Clearer Thinking | Report Errors"]:::external',
  '    n1["program_a"]',
  '    n2["program_b"]',
  "    n1 --> n0",
  "    n1 --> n2",
  "    n2 -. switch .-> n1",
  "    classDef external stroke-dasharray: 5 5",
].join("\n")

test(
  "uploading a zip renders a diagram and the Mermaid source",
  { skip },
  async () => {
    const zip = zipSync({
      "my_programs/program_a": strToU8(
        "Hello, world!\n*question: How are you today?\n*program: program_b\n*program: Clearer Thinking | Report Errors\n",
      ),
      "my_programs/program_b": strToU8("Welcome!\r\n*switch: program_a\r\n"),
    })

    const { server, url } = await serve()
    const browser = await chromium.launch()

    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 800 },
      })
      const errors = []
      page.on("pageerror", e => errors.push(e.message))
      await page.goto(url)

      await page.setInputFiles("#file-input", {
        name: "my_programs.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(zip),
      })

      await page.waitForSelector("#diagram svg")

      const labels = await page.$$eval("#diagram g.node text", els =>
        els
          .map(e =>
            [...e.querySelectorAll("tspan.row")]
              .map(r => r.textContent)
              .join(" "),
          )
          .sort(),
      )
      assert.deepEqual(labels, [
        "Clearer Thinking | Report Errors",
        "program_a",
        "program_b",
      ])

      assert.equal(await page.inputValue("#source"), EXPECTED_SOURCE)
      assert.equal(
        await page.textContent("#summary"),
        "2 programs in the zip, 1 external reference, 3 edges.",
      )
      assert.match(
        await page.textContent("#warnings-list"),
        /"Clearer Thinking \| Report Errors" is referenced by program_a but is not in the zip\./,
      )

      assert.equal(
        await page.isChecked("#fit"),
        true,
        "fit to width is on by default",
      )

      await page.selectOption("#direction", "LR")
      await page.waitForFunction(() =>
        document.getElementById("source").value.startsWith("flowchart LR"),
      )

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      )
      assert.equal(overflow, false, "page should not scroll horizontally")
      assert.deepEqual(errors, [])
    } finally {
      await browser.close()
      server.close()
    }
  },
)

async function clickDownload(page, selector) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click(selector),
  ])
  return {
    name: download.suggestedFilename(),
    bytes: fs.readFileSync(await download.path()),
  }
}

test("the diagram can be downloaded as SVG and PNG", { skip }, async () => {
  const zip = zipSync({
    "my_programs/program_a": strToU8("*program: program_b\n"),
    "my_programs/program_b": strToU8("Welcome!\n"),
  })

  const { server, url } = await serve()
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    await page.goto(url)
    await page.setInputFiles("#file-input", {
      name: "my_programs.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    })
    await page.waitForSelector("#diagram svg")

    const svg = await clickDownload(page, "#download-svg")
    assert.equal(svg.name, "my_programs.svg")
    const svgText = svg.bytes.toString("utf8")
    assert.ok(svgText.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
    assert.match(svgText, /<svg[^>]* xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(svgText, /<svg[^>]* width="\d+"[^>]* height="\d+"/)
    assert.ok(svgText.includes("program_a") && svgText.includes("program_b"))
    assert.ok(!svgText.includes("<foreignObject"), "labels must be SVG text")

    const png = await clickDownload(page, "#download-png")
    assert.equal(png.name, "my_programs.png")
    assert.deepEqual(
      [...png.bytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      "PNG signature",
    )
    assert.ok(png.bytes.length > 1000)

    const mmd = await clickDownload(page, "#download")
    assert.equal(mmd.name, "my_programs.mmd")
    assert.ok(mmd.bytes.toString("utf8").startsWith("flowchart TD\n"))
  } finally {
    await browser.close()
    server.close()
  }
})

test("a non-zip file shows an error", { skip }, async () => {
  const { server, url } = await serve()
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    await page.goto(url)
    await page.setInputFiles("#file-input", {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a zip"),
    })
    await page.waitForSelector("#error:not([hidden])")
    assert.equal(
      await page.textContent("#error"),
      "Could not read this file as a zip.",
    )
  } finally {
    await browser.close()
    server.close()
  }
})

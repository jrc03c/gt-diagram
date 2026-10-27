// GuidedTrack's "Package code" zip names each file after its program,
// verbatim and without an extension, except that a "/" inside a program
// name is written as U+2215 DIVISION SLASH so it can be a filename.

const DIVISION_SLASH = "∕"

export function programNameFromPath(path) {
  let name = path.slice(path.lastIndexOf("/") + 1)
  name = name.replaceAll(DIVISION_SLASH, "/")
  if (name.endsWith(".gt")) name = name.slice(0, -".gt".length)
  return name
}

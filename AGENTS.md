# Agent notes

This repository's agent instructions live in `CLAUDE.md` (project conventions, layout, facts that are easy to get wrong, commands). Read it first, whatever agent you are.

Two more things an agent needs here:

- **GuidedTrack language skill.** `.claude/skills/guidedtrack-builder/` is a git submodule of [GuidedTrack/GuidedTrackAICodingAgentSkill](https://github.com/GuidedTrack/GuidedTrackAICodingAgentSkill). Its `SKILL.md` and `references/complete_guide.md` are the authority on GuidedTrack syntax (`*program:`, `*switch:`, comments, indentation). After cloning run `git submodule update --init`; if the directory is empty, the skill was not initialised.
- **Design history.** `docs/superpowers/specs/` holds the design spec and `docs/superpowers/plans/` the implementation plan, including a revisions section for decisions that changed after the fact.

Quick start:

```sh
pnpm install
git submodule update --init
pnpm build && pnpm test && pnpm lint
```

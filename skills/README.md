# Satin agent skills

Skills that teach a coding agent to build Satin apps. They follow the open
[Agent Skills](https://agentskills.io/specification) format, so any agent that reads skills can use
them.

| Skill | What it covers |
| --- | --- |
| `satin-best-practices` | Building it right: ownership rules, components, navigation, data, layout, glass, install and updates, push, lint, and the checks before calling an app done. |
| `satin-design` | Looking native by default: structure, type, color, spacing and shape, materials, motion, icons, copy and accessibility, and how to apply a custom brand. The user's own design direction always wins. |

## Install

```sh
npx skills add satinhq/satin                            # both skills, this project
npx skills add satinhq/satin --skill satin-design      # one skill
npx skills add satinhq/satin -g                          # every project
```

The installer copies each skill folder into your agent's skills directory, for example
`.claude/skills/` for Claude Code or `.agents/skills/` for Codex. Agents load a skill's name and
description up front and read the rest only when a task needs it.

To install by hand, copy a skill folder into that directory.

## For contributors

Keep each `SKILL.md` short and put detail in its `references/` folder. Facts must match the
framework's shipped documentation; when an API changes, update the skill in the same change.
`node scripts/check-skills.mjs` validates the format and the shipped-documentation rules.

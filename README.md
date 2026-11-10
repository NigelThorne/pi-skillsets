# pi-skillsets

A [Pi](https://github.com/earendil-works/pi) package providing `/skillset`: choose a skill/extension collection per session.

## Install

```
pi install npm:pi-skillsets
```

## Usage

- `/skillset` – picker (interactive) or list (no UI)
- `/skillset list` – show active set and all discovered sets
- `/skillset <name>` – enable a set (reloads skills/extensions)
- `/skillset none` – disable

The selection is stored in the session and restored on resume.

## Layout

Skillsets live under `$PI_CODING_AGENT_DIR/skillsets` (default `~/.pi/agent/skillsets`):

```
skillsets/
  my-set/
    skillset.json      # optional
    skills/<name>/SKILL.md
    extensions/*.ts
```

## skillset.json

```json
{ "skills": ["skills"], "extensions": ["extensions/main.ts"] }
```

Both keys are arrays of paths relative to the skillset folder. Without a manifest, `{"skills": ["skills"]}` is assumed. Paths escaping the folder are rejected; missing paths mark the set "resource files not installed".

## Security

Skillset `extensions` are executable code run with your full user permissions when the set is enabled. Only enable skillsets you trust.

## Example skillsets

> **Not bundled.** These are independent, third-party repositories; this package ships none of their content. Their skills are instructions your agent will follow and their extensions are code that runs with your user permissions. **Review them before use.**

| Name | Upstream | Manifest | Notes |
|---|---|---|---|
| pocock | https://github.com/mattpocock/skills | `{"skills":["repo/skills/engineering","repo/skills/productivity"]}` | experimental/misc excluded |
| osmani | https://github.com/addyosmani/agent-skills | `{"skills":["repo/skills"]}` | |
| pstack | https://github.com/cursor/plugins (`pstack/` only) | `{"skills":["repo/pstack/skills"]}` | Cursor-oriented (model routing, Task subagents); some workflows need adaptation |
| my-pi | https://github.com/nigelthorne/my-pi | `{"skills":["repo/skills"]}` | skills only |
| pi-pstack | https://github.com/kkgogogo17/pi-pstack | `{"skills":["repo/skills"],"extensions":["repo/extensions/pstack/index.ts"]}` | **includes an extension (runs code)**; tested against v0.1.0 (`14da130e7aac196d355fa70706b06d5b4d71e095`); local patches may be needed for subagent spawning |
| tstack | https://github.com/t3dotgg/tstack | `{"skills":["repo/skills"]}` | Theo's skills for Claude Code/Codex |

Snippets (set `D` once; respects `$PI_CODING_AGENT_DIR`):

```sh
D="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skillsets"

# pocock
mkdir -p "$D/pocock" && git clone https://github.com/mattpocock/skills "$D/pocock/repo"
echo '{"skills":["repo/skills/engineering","repo/skills/productivity"]}' > "$D/pocock/skillset.json"

# osmani
mkdir -p "$D/osmani" && git clone https://github.com/addyosmani/agent-skills "$D/osmani/repo"
echo '{"skills":["repo/skills"]}' > "$D/osmani/skillset.json"

# pstack (sparse checkout of pstack/ only)
mkdir -p "$D/pstack" && git clone --filter=blob:none --sparse https://github.com/cursor/plugins "$D/pstack/repo"
git -C "$D/pstack/repo" sparse-checkout set pstack
echo '{"skills":["repo/pstack/skills"]}' > "$D/pstack/skillset.json"

# my-pi (skills only)
mkdir -p "$D/my-pi" && git clone https://github.com/nigelthorne/my-pi "$D/my-pi/repo"
echo '{"skills":["repo/skills"]}' > "$D/my-pi/skillset.json"

# pi-pstack (extension: runs code; pin to the tested commit)
mkdir -p "$D/pi-pstack" && git clone https://github.com/kkgogogo17/pi-pstack "$D/pi-pstack/repo"
git -C "$D/pi-pstack/repo" checkout 14da130e7aac196d355fa70706b06d5b4d71e095
echo '{"skills":["repo/skills"],"extensions":["repo/extensions/pstack/index.ts"]}' > "$D/pi-pstack/skillset.json"

# tstack
mkdir -p "$D/tstack" && git clone https://github.com/t3dotgg/tstack "$D/tstack/repo"
echo '{"skills":["repo/skills"]}' > "$D/tstack/skillset.json"
```

Update (then run `/reload` in pi), e.g. for tstack:

```sh
git -C "$D/tstack/repo" pull --ff-only
```

Select a skillset with `/skillset <name>`.

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

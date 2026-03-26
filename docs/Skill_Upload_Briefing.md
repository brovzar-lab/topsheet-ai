# What I'm Uploading: Claude Skills

I use custom "skills" with Claude.ai. When I upload one, here's what you're receiving:

## File Format

A skill can arrive as:

- **A `.skill` file** — This is a ZIP archive. Unzip it mentally. Inside is a folder.
- **A `.md` file** — This is the core instruction file by itself (`SKILL.md`).
- **A folder** — The skill directory with everything inside it.

## What's Inside a Skill

```
skill-name/
├── SKILL.md              ← The main file. Always present. Start here.
├── references/           ← Optional. Deep-dive docs on specific topics.
│   ├── methodology-a.md
│   ├── methodology-b.md
│   └── ...
├── scripts/              ← Optional. Code that runs during the skill.
└── assets/               ← Optional. Templates, fonts, images used in output.
```

## How to Read SKILL.md

It starts with YAML frontmatter between `---` markers:

```yaml
---
name: skill-name
description: What this skill does and when it triggers.
---
```

Everything after the frontmatter is the actual instruction set — the persona, methodology, workflow, and rules that Claude follows when this skill is active. Treat it as the skill's brain.

## What the Reference Files Are

Files in `references/` are supplementary knowledge — detailed frameworks, rate tables, methodology breakdowns, domain-specific docs. The SKILL.md will say things like "Read `references/save-the-cat.md` for the full beat sheet." They expand on what's in the main file.

## How to Treat What I Upload

When I share a skill with you, I want you to:
1. Read the SKILL.md first to understand the persona and methodology
2. Read any reference files to get the full depth
3. Use that knowledge as context for whatever I ask you to do next

The skill defines an expert persona with specific frameworks, opinions, and workflows. Absorb it and operate from that knowledge base.

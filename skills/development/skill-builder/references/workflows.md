# Workflow Patterns

## Sequential Workflows

For complex tasks, give an overview at the top of SKILL.md, then break into clear steps:

```markdown
Filling a PDF form involves these steps:
1. Analyze the form (run analyze_form.py)
2. Create field mapping (edit fields.json)
3. Validate mapping (run validate_fields.py)
4. Fill the form (run fill_form.py)
5. Verify output (run verify_output.py)
```

## Conditional Workflows

For branching logic, guide the agent through decision points explicitly:

```markdown
1. Determine the modification type:
   **Creating new content?** → Follow "Creation workflow" below
   **Editing existing content?** → Follow "Editing workflow" below

2. Creation workflow: [steps]
3. Editing workflow: [steps]
```

## Multi-Domain Organization

For skills covering multiple domains, organize references by domain so irrelevant content is never loaded:

```
bigquery-skill/
├── SKILL.md (overview + navigation)
└── references/
    ├── finance.md   (revenue, billing metrics)
    ├── sales.md     (pipeline, opportunities)
    └── product.md   (API usage, features)
```

When a user asks about sales, the agent only reads `sales.md`.

## Multi-Variant Organization

For skills supporting multiple frameworks or environments:

```
cloud-deploy/
├── SKILL.md (workflow + provider selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

When the user picks AWS, the agent only reads `aws.md`.

## Key Rules

- Keep references **one level deep** from SKILL.md — avoid deeply nested reference chains
- For reference files over 100 lines, **add a table of contents** at the top
- Always describe **when to read** each reference file in SKILL.md so the agent knows they exist

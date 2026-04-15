# Output Patterns

Use these patterns when skills need to produce consistent, high-quality output.

## Template Pattern

Provide output templates. Match strictness to the task's fragility.

**Strict (API responses, data formats):**
```markdown
## Report structure
ALWAYS use this exact template:

# [Analysis Title]
## Executive summary
[One-paragraph overview]
## Key findings
- Finding 1 with supporting data
- Finding 2 with supporting data
## Recommendations
1. Specific actionable recommendation
2. Specific actionable recommendation
```

**Flexible (when adaptation is useful):**
```markdown
## Report structure
Sensible default — use your judgment:

# [Analysis Title]
## Executive summary
## Key findings
[Adapt sections based on what you discover]
## Recommendations
[Tailor to the specific context]
```

## Examples Pattern

For skills where output quality depends on seeing concrete examples, provide input/output pairs:

```markdown
## Commit message format

**Example 1:**
Input: Added user authentication with JWT tokens
Output:
feat(auth): implement JWT-based authentication

Add login endpoint and token validation middleware

**Example 2:**
Input: Fixed bug where dates displayed incorrectly in reports
Output:
fix(reports): correct date formatting in timezone conversion

Use UTC timestamps consistently across report generation

Follow this style: type(scope): brief description, then detailed explanation.
```

Examples help the agent understand desired style and detail level better than descriptions alone.

## Degree of Freedom Guide

Match instruction style to how much variation is acceptable:

| Freedom | Format | When to Use |
|---------|--------|-------------|
| **High** | Prose instructions | Multiple valid approaches, context-dependent decisions |
| **Medium** | Pseudocode + params | Preferred pattern exists, some variation OK |
| **Low** | Specific scripts, strict steps | Fragile operations, must be consistent every time |

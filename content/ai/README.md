# AI Course Generation Assets

This folder stores machine-readable assets for AI-driven lesson generation.

## Structure

```text
content/ai/
  capability-cards/         # reusable teaching capabilities
  capability-aliases.json   # renamed/removed capability mapping
  rules/                    # hard rules and rubric
  schemas/                  # I/O contracts
  templates/                # prompt and lesson templates
  regression/               # request/plan snapshot regression assets
  examples/                 # sample request/plan/lesson-package
```

## Core Contracts

- `schemas/course-request.schema.json`
- `schemas/course-plan.schema.json`
- `schemas/lesson-package.schema.json`
- `schemas/capability-card.schema.json`
- `schemas/capability-aliases.schema.json`

## Current Seed

- 10 capability cards across geometry / algorithm / calculus / graphics / pedagogy.
- Prompt templates and a lesson template set.
- Hard rule and rubric definitions for quality gate.
- Example request/plan pair under `content/ai/examples/`.
- Example lesson package under `content/ai/examples/lesson-package.sample.json`.
- Local planner prototype: `scripts/generate-course-plan.mjs`.
- Local package generator prototype: `scripts/generate-lesson-package.mjs`.
- Lifecycle support: `status` / `replaced_by` in capability cards.
- Regression checks: `scripts/check-course-plan-snapshots.mjs`.
- Regression checks: `scripts/check-lesson-package-snapshots.mjs`.
- Frontend integration: sidebar actions for AI create/update/delete/settings in `src/main.ts`.

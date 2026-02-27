# DSL Templates

Use these templates when starting a new lesson:

- `lesson-starter.yaml`: full lesson skeleton with `views`, `symbol` baseline, `ui` sliders, timeline markers, and optional `line/plane/model` snippets.
- `symbol-catalog.yaml`: copy-ready preset symbols (`camera`, `light`, `target`, etc.).

Quick workflow:

1. Copy `lesson-starter.yaml` to `src/dsl/examples/<lesson-id>.yaml`.
2. Keep or remove symbol entities from the starter as needed.
3. Copy additional symbol blocks from `symbol-catalog.yaml`.
4. Fill `meta`, lesson entities/relations, and timeline.
5. Add matching doc file in `content/lessons/<lesson-id>.md`.

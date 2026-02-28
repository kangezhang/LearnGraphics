# AI 课程生成架构规范（v1）

> 目标：把平台“基础能力”结构化给 AI，让 AI 能稳定生成用户想要的课程内容（大纲 + 讲解 + 练习 + 评估 + DSL 产物）

---

## 1. 能力结构化输出（Capability Cards）

### 1.1 能力卡最小字段

```json
{
  "capability_id": "teach.geometry.vector_projection.basic",
  "name": "向量投影基础讲解",
  "version": "1.0.0",
  "domain": "geometry",
  "level": "beginner",
  "inputs": [
    "learner_level",
    "duration_min",
    "goal"
  ],
  "outputs": [
    "lesson_script",
    "exercise_set",
    "assessment_rubric",
    "dsl_patch"
  ],
  "dependencies": [
    "math.vector.dot_product"
  ],
  "constraints": [
    "必须包含1个生活化类比",
    "必须包含1个可操作练习"
  ],
  "quality_criteria": [
    "概念准确",
    "术语一致",
    "步骤可执行"
  ],
  "template_refs": [
    "template.lesson.explain_then_practice.v1"
  ],
  "dsl_refs": [
    "dsl/examples/vector-dot.yaml"
  ],
  "failure_codes": [
    "TERM_INCONSISTENT",
    "NO_ACTIONABLE_EXERCISE"
  ],
  "examples": [
    {
      "input": {
        "learner_level": "初学者",
        "duration_min": 20,
        "goal": "理解投影长度意义"
      },
      "output_summary": "含图形直觉解释与2题练习"
    }
  ]
}
```

### 1.2 建议目录结构

```text
content/
  ai/
    capability-cards/
      geometry/
      algorithm/
      calculus/
    templates/
      lesson-templates.json
      prompt-templates.md
    rules/
      hard-rules.json
      rubric.json
    schemas/
      course-request.schema.json
      course-plan.schema.json
      lesson-package.schema.json
```

---

## 2. 统一输入输出协议（强约束）

### 2.1 输入：课程生成请求 `course_request`

```json
{
  "request_id": "req_20260227_001",
  "topic": "向量投影",
  "learner_profile": {
    "level": "beginner",
    "age_group": "high_school"
  },
  "goal": "理解投影在分解力中的意义",
  "duration_min": 25,
  "style": "直观+步骤化",
  "must_include": [
    "生活案例",
    "可操作练习"
  ],
  "must_avoid": [
    "超纲证明"
  ],
  "output_format": [
    "markdown",
    "dsl_patch"
  ]
}
```

### 2.2 输出：课程包 `lesson_package`

```json
{
  "request_id": "req_20260227_001",
  "course_plan": {},
  "lesson_script": {},
  "exercise_set": {},
  "assessment_rubric": {},
  "dsl_patch": [],
  "quality_report": {
    "hard_rule_pass": true,
    "rubric_score": 4.4,
    "violations": []
  }
}
```

---

## 3. 生成流水线（Pipeline）

### 3.1 阶段划分
1. `Intent Parser`：把自然语言需求转成 `course_request`。
2. `Capability Planner`：从能力卡中检索并排序，产出 `course_plan`。
3. `Content Generator`：按模板分段生成 `lesson_script` 与 `exercise_set`。
4. `DSL Composer`：生成 `dsl_patch` 或完整 lesson DSL。
5. `Quality Gate`：硬规则校验 + Rubric 打分，不合格自动重生失败段落。

### 3.2 编排结果 `course_plan` 示例

```json
{
  "plan_id": "plan_001",
  "topic": "向量投影",
  "segments": [
    {
      "segment_id": "s1",
      "title": "问题引入",
      "duration_min": 4,
      "capabilities": [
        "teach.story_context.force_split"
      ],
      "expected_output": [
        "opening_question",
        "scenario"
      ]
    },
    {
      "segment_id": "s2",
      "title": "核心概念",
      "duration_min": 10,
      "capabilities": [
        "teach.geometry.vector_projection.basic"
      ],
      "expected_output": [
        "concept_explain",
        "visual_steps"
      ]
    }
  ]
}
```

---

## 4. Prompt 模板（可直接落地）

### 4.1 需求解析 Prompt（Intent Parser）

```text
[System]
你是课程需求结构化引擎。只输出 JSON，不输出解释文本。
必须符合 schema: course_request.schema.json。

[User]
用户原始需求：
{{user_input}}

补充上下文：
{{project_constraints}}
```

### 4.2 能力编排 Prompt（Capability Planner）

```text
[System]
你是课程能力编排引擎。输入是 course_request 和 capability_cards。
输出 course_plan JSON，必须给出每段时长、调用能力、先修关系解释。
不得引用不存在的 capability_id。

[User]
course_request:
{{course_request_json}}

candidate_capabilities:
{{capability_cards_json}}
```

### 4.3 内容生成 Prompt（Content Generator）

```text
[System]
你是课程内容生成引擎。严格按 course_plan 分段生成。
每段必须包含：讲解文本、可执行步骤、至少1个检查问题。
只输出 lesson_script JSON，不输出额外文本。

[User]
course_plan:
{{course_plan_json}}

style_rules:
{{style_rules}}
```

### 4.4 质量校验 Prompt（Quality Gate）

```text
[System]
你是课程质量审查引擎。先执行 hard rules，再给 rubric 评分。
若 hard rule 不通过，返回 violation 列表和最小重生成建议。
只输出 quality_report JSON。

[User]
lesson_package:
{{lesson_package_json}}

hard_rules:
{{hard_rules_json}}

rubric:
{{rubric_json}}
```

---

## 5. 校验规则清单

### 5.1 Hard Rules（必须通过）
1. 结构完整：必须含 `course_plan/lesson_script/exercise_set/assessment_rubric`。
2. 时长一致：各段时长总和必须在 `duration_min ± 10%`。
3. 术语一致：术语表命名必须统一，不允许同义混写。
4. 练习可执行：每个练习必须有输入、步骤、期望结果。
5. 评估可判分：rubric 每个维度必须有 1-5 分判据。
6. DSL 可编译：`dsl_patch` 应可被 `PatchApplier` 应用并通过 `DSLValidator`。

### 5.2 Rubric（建议阈值）
- `accuracy`（准确性）>= 4
- `clarity`（清晰度）>= 4
- `engagement`（可理解性与参与感）>= 3
- `actionability`（可执行性）>= 4
- `alignment`（目标对齐）>= 4

---

## 6. 自动重试与最小重生策略

1. 仅重生失败段落，不重生整课（降低漂移）。
2. 每次重试最多修复 3 个 violation，避免过拟合。
3. 若连续 2 次失败，降级为“模板保守模式”（固定课型模板）。
4. 保留每次失败快照，便于比较与回滚。

---

## 7. 与现有架构对齐点

1. 能力卡产物最终映射到现有 DSL 体系（`dsl/examples` + `dsl/templates`）。
2. `dsl_patch` 通过 `dsl/patch/PatchApplier.ts` 落地，失败交由 `semantic/validator/DSLValidator.ts` 返回可读错误。
3. `course_plan` 的步骤应映射到 Timeline（`StepTrack/StateTrack/EventTrack`）。
4. 质量门禁可作为编译前置环节，避免“可生成但不可运行”的课程产物。

---

## 8. MVP 落地顺序（建议 2 周）

1. 建 30-50 张高频能力卡（几何/图算法/数值各一批）。
2. 先打通“需求 -> 大纲 -> 课程脚本 -> 质量报告”四段链路。
3. 接入 `dsl_patch` 生成与校验，形成闭环。
4. 以现有 5 个示例课做回归，统计通过率与重试率。

---

## 9. 当前落地状态（2026-02-27）

1. 目录骨架已创建：`content/ai/`
2. 协议 schema 已落地：
   - `content/ai/schemas/course-request.schema.json`
   - `content/ai/schemas/course-plan.schema.json`
   - `content/ai/schemas/lesson-package.schema.json`
   - `content/ai/schemas/capability-card.schema.json`
3. 质量规则已落地：
   - `content/ai/rules/hard-rules.json`
   - `content/ai/rules/rubric.json`
4. 模板已落地：
   - `content/ai/templates/lesson-templates.json`
   - `content/ai/templates/prompt-templates.md`
5. 首批能力卡样例已落地：`content/ai/capability-cards/`（10 张）
6. 编排原型已落地：
   - `scripts/generate-course-plan.mjs`
   - 输入样例：`content/ai/examples/course-request.sample.json`
   - 输出样例：`content/ai/examples/course-plan.sample.json`
7. 资产校验已支持示例 schema 检查：
   - `npm run check:ai-assets`
8. 生命周期与迁移机制已落地：
   - 能力卡字段：`status`（active/deprecated/removed）+ `replaced_by`
   - 迁移映射：`content/ai/capability-aliases.json`
9. 回归快照已落地：
   - 回归请求：`content/ai/regression/requests/*.json`
   - 快照检查：`npm run check:course-plan-snapshots`
   - 更新快照：`npm run check:course-plan-snapshots -- --update`
10. 课程包生成与回归已落地：
   - 生成脚本：`scripts/generate-lesson-package.mjs`
   - 示例产物：`content/ai/examples/lesson-package.sample.json`
   - 快照检查：`npm run check:lesson-package-snapshots`
   - 更新快照：`npm run check:lesson-package-snapshots -- --update`
11. 前端交互与持久化已落地：
   - 侧栏动作：`+AI创建 / AI更新 / 删除AI / API设置`
   - 存储：`localStorage`（课程与 API 配置）
   - 兼容策略：无 API 配置时使用本地回退生成

---

**版本**：v1  
**更新日期**：2026-02-27

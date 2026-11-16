# super-ppts MVP Implementation Plan

> 后续四步合同见 `2026-11-16-super-ppts-four-stage.md`。本文件保留首版记录。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-process Chinese Next.js app that turns a topic into an approved outline, a 16:9 preview, an editable diagram, and a native PPTX.

**Architecture:** Domain rules and Diagram IR live in `src/domain`. SQLite stores versions. PptxGenJS writes text, shapes, tables, and charts; a post-pass rewrites edges into `p:cxnSp` with `stCxn`/`endCxn`. Demo and live providers share one interface. The UI never sees API keys.

**Tech Stack:** Next.js 16.4.6, React 19.3.1, TypeScript 5.9.3, Zod 3.25.76, PptxGenJS 4.0.1, fflate 0.8.2, Vitest 5, Playwright, Node 22 `node:sqlite`.

## Global Constraints

- Chinese UI copy.
- Section count 1–8, explained in the outline UI.
- Demo mode only when `AI_API_KEY` is empty; live failures must not return fixture data or the key.
- Preview text exactly includes `屏幕预览，不是 PowerPoint 的像素结果。`
- Export must produce real `p:sp`, `p:cxnSp` endpoint bindings, `a:tbl`, chart XML, and an embedded xlsx workbook.
- Do not add image parts for diagrams or charts.
- Single-user trusted local deployment. No login, import, templates, agents, or deploy scripts.
- Licenses already checked: MIT for next, react, react-dom, zod, pptxgenjs, fflate, vitest, @types/node, @types/react, @types/react-dom; Apache-2.0 for typescript and @playwright/test.

---

### Task 1: Tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`, `.gitignore`, `.env.example`

**Interfaces:**
- Produces: `pnpm test` runs Vitest in Node with `tests/**/*.test.ts`.

- [ ] Add the pinned dependencies and scripts `dev`, `build`, `start`, `test`, `typecheck`, `test:e2e`.
- [ ] Ignore `.env`, `.next`, `node_modules`, `data/`, Playwright output.

### Task 2: Outline and diagram validation

**Files:**
- Create: `src/domain/errors.ts`, `src/domain/types.ts`, `src/domain/validate.ts`
- Test: `tests/validate.test.ts`

**Interfaces:**
- Produces: `parseOutline(input: unknown): OutlineSection[]`, `parseDiagram(input: unknown): Diagram`, `AppError`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseOutline } from "../src/domain/validate";

describe("parseOutline", () => {
  it("rejects an empty section list", () => {
    expect(() => parseOutline([])).toThrowError(/1/);
  });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run tests/validate.test.ts` and confirm the import fails.
- [ ] **Step 3: Implement parsers** for all five section kinds, diagram edges, and chart series length.
- [ ] **Step 4: Re-run the file until pass.**

### Task 3: Deterministic layout

**Files:**
- Create: `src/domain/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Consumes: `Diagram` from `src/domain/types.ts`.
- Produces: `layoutDiagram(diagram: Diagram): Diagram`.

- [ ] Assert two calls return deep-equal coordinates and a TB edge places the source above the target.
- [ ] Layer by longest distance from roots. Stable order is original node order. Cycles do not recurse forever.
- [ ] `algorithm: "manual"` returns the same coordinates.

### Task 4: Providers

**Files:**
- Create: `src/ai/types.ts`, `src/ai/fixture.ts`, `src/ai/provider.ts`
- Test: `tests/provider.test.ts`

**Interfaces:**
- Produces: `resolveProvider(env, fetchImpl?) => { mode, provider }`.
- `provider.generate({ sourceKind, sourceText })` and `provider.optimize({ sections, instruction, sectionId? })`.

- [ ] Demo generate returns the library-corner fixture and does not call fetch.
- [ ] Demo optimize appends `（收紧）` to the targeted title.
- [ ] Live mode with a throwing fetch rejects `PROVIDER_UNAVAILABLE` and the message has no API key.
- [ ] Live mode without base URL or model rejects `PROVIDER_CONFIG` without calling fetch.
- [ ] A successful mock response that fails Zod becomes `PROVIDER_SCHEMA`.

### Task 5: Native PPTX

**Files:**
- Create: `src/pptx/build.ts`, `src/pptx/ooxml.ts`
- Test: `tests/pptx-ooxml.test.ts`, `tests/helpers/zip.ts`

**Interfaces:**
- Consumes: `ExportDeck` in `src/pptx/build.ts`.
- Produces: `buildPptx(deck: ExportDeck): Promise<Buffer>`.

- [ ] Build a five-slide deck: title, bullets, table, diagram with two nodes and one edge, bar chart categories `一月`/`二月` and values `10`/`16`.
- [ ] Unzip and assert `a:t`, `a:ea`, `a:tbl`, named `p:sp`, `p:cxnSp` endpoint ids, `ppt/charts/chart1.xml`, and an embeddings xlsx containing `一月` and `10`.
- [ ] Assert the diagram and chart slides have no image relationships.
- [ ] If PptxGenJS omits the workbook or the connector, fix it in `ooxml.ts`. Do not snapshot a picture.

### Task 6: Persistence and workflow

**Files:**
- Create: `src/db/database.ts`, `src/server/service.ts`
- Test: `tests/workflow.test.ts`

**Interfaces:**
- Produces service methods: `createProject`, `updateOutline`, `optimize`, `acceptOptimization`, `discardOptimization`, `approveAndMaterialize`, `getProject`, `getDiagram`, `saveDiagram`, `relayoutDiagram`, `reseedDiagram`, `exportProject`.

- [ ] Create, edit, reload.
- [ ] Optimize then accept and discard.
- [ ] Approve, export bytes, edit outline, export throws `OUTLINE_NOT_APPROVED`.
- [ ] Diagram save survives a second `getDiagram`.
- [ ] Dangling edge throws `DANGLING_EDGE`.

### Task 7: HTTP and Chinese UI

**Files:**
- Create: `src/app/**`, `src/components/**`, `src/app/api/**`
- Test: `e2e/demo.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes the service through route handlers. Client components call relative `/api` only.

- [ ] Routes return `{ code, message }` on `AppError`.
- [ ] Pages: home, outline, preview, diagram. Include the section-limit explanation and the preview disclaimer.
- [ ] Playwright demo: generate, edit, save, reload, optimize, accept, approve, open diagram, edit label, reload, export download, then invalidate and see the export error.

### Task 8: README and verification

**Files:**
- Create: `README.md`

- [ ] Chinese install, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm dev`, `pnpm test:e2e`.
- [ ] `.env.example` placeholders only.
- [ ] Matrix of native, fallback, and unsupported behavior.
- [ ] Run typecheck, unit tests, production build, and browser e2e. Save screenshots and a sample pptx under `/opt/cursor/artifacts/`.

## Self-review

- Spec acceptance items 1–8 map to Tasks 4, 6, 5, and 7.
- No task treats SVG as the exported diagram.
- `resolveProvider` is the only mode switch and is covered by Task 4.
- Names used later (`parseOutline`, `layoutDiagram`, `buildPptx`, `approveAndMaterialize`) are defined in the task that produces them.
- Placeholder scan: no TBD steps. UI copy that must stay stable is quoted in Global Constraints and Task 7.

## Execution

User approved implementation and told the agent not to ask about execution mechanics. Execute inline in this session with TDD.

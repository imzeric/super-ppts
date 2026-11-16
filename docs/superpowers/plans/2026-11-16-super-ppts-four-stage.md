# Four-stage outline to editable PPTX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace immediate deck materialization with Markdown outline, confirmed slide copy, manual placeholders, and explicit batch rendering.

**Architecture:** Markdown parses into the existing section model. Slots store geometry and either stay native placeholder shapes or render through Diagram IR, chart data, tables, or a labeled raster. Provider profiles never return secrets.

**Tech Stack:** Existing Next.js, Zod, PptxGenJS, node:sqlite, Vitest, Playwright.

## Global Constraints

- Same branch and PR. Do not merge.
- Demo mode makes no network calls. Tests must not call paid providers.
- Illustration is picture-only. Native connectors and chart workbooks stay mandatory.
- Blank provider save does not erase a key. Clear is a separate action.
- Upstream edits mark downstream stale and keep manual slot geometry.

### Task 1: Markdown contract

- [ ] Parse the bounded syntax with line diagnostics.
- [ ] Demo fixture and optimize candidate use that Markdown.

### Task 2: Stages and slots

- [ ] Confirm outline, generate and confirm copy, add up to 8 slots, batch with skip, retry, and cancel.
- [ ] Stale upstream change blocks export until the user explicitly keeps existing work.

### Task 3: Export and providers

- [ ] Placeholder export is `p:sp` text. Diagram export binds `p:cxnSp`. Charts keep embedded workbooks. Images appear only for illustration.
- [ ] Text chat, vision image_url, and image b64_json adapters. GET masks keys.

### Task 4: UI and docs

- [ ] Chinese pages for the four steps plus settings.
- [ ] Browser flow, README matrix, screenshots, and a sample pptx.

## Execution

User asked to implement on the existing branch without choosing mechanics again. Execute inline.

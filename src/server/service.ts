import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { readCapability } from "../ai/credentials";
import { DEMO_PNG_BASE64, demoPngBytes, generateImage } from "../ai/media";
import { chatJson, type FetchLike, type OutlineProvider } from "../ai/provider";
import { semanticFromSlot } from "../ai/semantic";
import { AppError } from "../domain/errors";
import { layoutDiagram, seedByIntent, seedDiagram } from "../domain/layout";
import { parseMarkdownOutline } from "../domain/markdown";
import { parseSlot, type Slot } from "../domain/slots";
import type { Diagram, OutlineSection } from "../domain/types";
import { LIMITS } from "../domain/types";
import { parseDiagram, parseOutline, parseSourceText } from "../domain/validate";
import { buildPptx, type ComposedSlot, type ExportDeck } from "../pptx/build";

export type SlideCopy = { id: string; title: string; lines: string[] };

export type ProjectView = {
  mode: "demo" | "live";
  project: { id: string; title: string; background: string };
  outline: {
    versionId: string;
    versionNo: number;
    status: "draft" | "confirmed";
    markdown: string;
    title: string;
    sections: OutlineSection[];
    issues: Array<{ line: number; message: string }>;
  };
  candidate: null | { versionId: string; versionNo: number; markdown: string };
  copy: null | { status: "draft" | "confirmed"; stale: boolean; slides: SlideCopy[] };
  slots: Slot[];
  diagrams: Array<{ id: string; label: string }>;
};

type VersionRow = {
  id: string;
  version_no: number;
  status: "draft" | "confirmed";
  role: string;
  sections_json: string;
  markdown: string;
};

type Env = Record<string, string | undefined>;

export function createServices(
  db: DatabaseSync,
  provider: OutlineProvider,
  mode: "demo" | "live",
  options: { env?: Env; fetchImpl?: FetchLike } = {},
) {
  const env = options.env ?? {};
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = () => new Date().toISOString();

  const oneVersion = (projectId: string, role: "current" | "candidate"): VersionRow => {
    const row = db.prepare("SELECT * FROM outline_versions WHERE project_id = ? AND role = ?").get(projectId, role) as VersionRow | undefined;
    if (!row) throw new AppError("NOT_FOUND", role === "candidate" ? "没有待处理的优化。" : "没有找到大纲。", 404);
    return row;
  };

  const nextVersionNo = (projectId: string) =>
    Number((db.prepare("SELECT COALESCE(MAX(version_no), 0) AS n FROM outline_versions WHERE project_id = ?").get(projectId) as { n: number }).n) + 1;

  const archiveRole = (projectId: string, role: "current" | "candidate") => {
    db.prepare("UPDATE outline_versions SET role = 'archived' WHERE project_id = ? AND role = ?").run(projectId, role);
  };

  const markDownstreamStale = (projectId: string) => {
    db.prepare("UPDATE slide_copies SET stale = 1, updated_at = ? WHERE project_id = ?").run(now(), projectId);
    const slots = loadSlots(db, projectId);
    for (const slot of slots) {
      db.prepare("UPDATE slots SET payload_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify({ ...slot, stale: true }), now(), slot.id);
    }
  };

  const view = (projectId: string): ProjectView => {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
      | { id: string; title: string; source_text: string }
      | undefined;
    if (!project) throw new AppError("NOT_FOUND", "没有找到这份文稿。", 404);
    const current = oneVersion(projectId, "current");
    const parsed = parseMarkdownOutline(current.markdown || "");
    const candidate = db.prepare("SELECT * FROM outline_versions WHERE project_id = ? AND role = 'candidate'").get(projectId) as VersionRow | undefined;
    const copy = db.prepare("SELECT * FROM slide_copies WHERE project_id = ?").get(projectId) as
      | { status: "draft" | "confirmed"; stale: number; slides_json: string }
      | undefined;
    const diagrams = db.prepare("SELECT id, ir_json FROM diagrams WHERE project_id = ?").all(projectId) as Array<{ id: string; ir_json: string }>;
    return {
      mode,
      project: { id: project.id, title: project.title, background: project.source_text },
      outline: {
        versionId: current.id,
        versionNo: current.version_no,
        status: current.status,
        markdown: current.markdown,
        title: parsed.title,
        sections: parsed.sections,
        issues: parsed.issues,
      },
      candidate: candidate ? { versionId: candidate.id, versionNo: candidate.version_no, markdown: candidate.markdown } : null,
      copy: copy ? { status: copy.status, stale: copy.stale === 1, slides: JSON.parse(copy.slides_json) as SlideCopy[] } : null,
      slots: loadSlots(db, projectId),
      diagrams: diagrams.map((row) => ({ id: row.id, label: labelOf(row.ir_json) })),
    };
  };

  const requireConfirmedOutline = (projectId: string) => {
    const current = oneVersion(projectId, "current");
    const parsed = parseMarkdownOutline(current.markdown);
    if (current.status !== "confirmed" || parsed.issues.length > 0) {
      throw new AppError("OUTLINE_NOT_APPROVED", "请先确认没有语法问题的 Markdown 大纲。", 409);
    }
    return parsed;
  };

  return {
    mode,
    createProject: async (input: { background: string }) => {
      const background = parseSourceText(input.background);
      const markdown = await provider.generateMarkdown({ background });
      const parsed = parseMarkdownOutline(markdown);
      const id = randomUUID();
      db.prepare("INSERT INTO projects (id, title, source_kind, source_text, created_at) VALUES (?, ?, 'background', ?, ?)").run(
        id,
        parsed.title || background.slice(0, 40),
        background,
        now(),
      );
      db.prepare(
        "INSERT INTO outline_versions (id, project_id, version_no, status, role, sections_json, markdown, created_at) VALUES (?, ?, 1, 'draft', 'current', ?, ?, ?)",
      ).run(randomUUID(), id, JSON.stringify(parsed.sections), markdown, now());
      return view(id);
    },
    getProject: (projectId: string) => view(projectId),
    updateMarkdown: (projectId: string, markdown: string) => {
      if (markdown.length < 1 || markdown.length > 20_000) throw new AppError("VALIDATION", "大纲需要 1 到 20000 个字符。", 400);
      const current = oneVersion(projectId, "current");
      const parsed = parseMarkdownOutline(markdown);
      if (current.status === "confirmed" && current.markdown !== markdown) markDownstreamStale(projectId);
      archiveRole(projectId, "candidate");
      archiveRole(projectId, "current");
      db.prepare(
        "INSERT INTO outline_versions (id, project_id, version_no, status, role, sections_json, markdown, created_at) VALUES (?, ?, ?, 'draft', 'current', ?, ?, ?)",
      ).run(randomUUID(), projectId, nextVersionNo(projectId), JSON.stringify(parsed.sections), markdown, now());
      if (parsed.title) db.prepare("UPDATE projects SET title = ? WHERE id = ?").run(parsed.title, projectId);
      return view(projectId);
    },
    optimize: async (projectId: string, input: { instruction: string; headingId?: string }) => {
      const instruction = input.instruction.trim();
      if (!instruction || instruction.length > LIMITS.instruction) {
        throw new AppError("VALIDATION", `优化说明需要 1 到 ${LIMITS.instruction} 个字。`, 400);
      }
      const current = oneVersion(projectId, "current");
      const markdown = await provider.optimizeMarkdown({ markdown: current.markdown, instruction, headingId: input.headingId });
      const parsed = parseMarkdownOutline(markdown);
      archiveRole(projectId, "candidate");
      db.prepare(
        "INSERT INTO outline_versions (id, project_id, version_no, status, role, sections_json, markdown, created_at) VALUES (?, ?, ?, 'draft', 'candidate', ?, ?, ?)",
      ).run(randomUUID(), projectId, nextVersionNo(projectId), JSON.stringify(parsed.sections), markdown, now());
      return view(projectId);
    },
    acceptOptimization: (projectId: string) => {
      const candidate = oneVersion(projectId, "candidate");
      const current = oneVersion(projectId, "current");
      if (current.status === "confirmed" && current.markdown !== candidate.markdown) markDownstreamStale(projectId);
      archiveRole(projectId, "current");
      db.prepare("UPDATE outline_versions SET role = 'current', status = 'draft' WHERE id = ?").run(candidate.id);
      const parsed = parseMarkdownOutline(candidate.markdown);
      if (parsed.title) db.prepare("UPDATE projects SET title = ? WHERE id = ?").run(parsed.title, projectId);
      return view(projectId);
    },
    discardOptimization: (projectId: string) => {
      oneVersion(projectId, "candidate");
      archiveRole(projectId, "candidate");
      return view(projectId);
    },
    confirmOutline: (projectId: string) => {
      if (db.prepare("SELECT id FROM outline_versions WHERE project_id = ? AND role = 'candidate'").get(projectId)) {
        throw new AppError("VALIDATION", "还有未处理的优化。请先采用或放弃。", 400);
      }
      const current = oneVersion(projectId, "current");
      const parsed = parseMarkdownOutline(current.markdown);
      if (parsed.issues.length > 0) throw new AppError("VALIDATION", parsed.issues[0]?.message ?? "大纲还有语法问题。", 400);
      parseOutline(parsed.sections);
      db.prepare("UPDATE outline_versions SET status = 'confirmed', sections_json = ? WHERE id = ?").run(JSON.stringify(parsed.sections), current.id);
      return view(projectId);
    },
    generateCopy: (projectId: string) => {
      const parsed = requireConfirmedOutline(projectId);
      const slides = parsed.sections.map(toCopy);
      const existing = db.prepare("SELECT project_id FROM slide_copies WHERE project_id = ?").get(projectId);
      if (existing) {
        db.prepare("UPDATE slide_copies SET status = 'draft', stale = 0, slides_json = ?, updated_at = ? WHERE project_id = ?").run(
          JSON.stringify(slides),
          now(),
          projectId,
        );
      } else {
        db.prepare("INSERT INTO slide_copies (project_id, status, stale, slides_json, updated_at) VALUES (?, 'draft', 0, ?, ?)").run(
          projectId,
          JSON.stringify(slides),
          now(),
        );
      }
      return view(projectId);
    },
    updateCopy: (projectId: string, slides: SlideCopy[]) => {
      const current = requireCopy(db, projectId);
      const known = new Set(current.slides.map((slide) => slide.id));
      if (slides.length !== current.slides.length || slides.some((slide) => !known.has(slide.id))) {
        throw new AppError("VALIDATION", "文字稿的页不能增删，只能修改标题和正文。", 400);
      }
      const next = slides.map((slide) => ({ id: slide.id, title: slide.title.trim(), lines: slide.lines.map((line) => line.trim()).filter(Boolean) }));
      if (next.some((slide) => !slide.title)) throw new AppError("VALIDATION", "每一页都需要标题。", 400);
      db.prepare("UPDATE slide_copies SET status = 'draft', slides_json = ?, updated_at = ? WHERE project_id = ?").run(JSON.stringify(next), now(), projectId);
      if (current.status === "confirmed") markDownstreamStale(projectId);
      db.prepare("UPDATE slide_copies SET stale = 0 WHERE project_id = ?").run(projectId);
      return view(projectId);
    },
    confirmCopy: (projectId: string) => {
      requireConfirmedOutline(projectId);
      requireCopy(db, projectId);
      db.prepare("UPDATE slide_copies SET status = 'confirmed', stale = 0, updated_at = ? WHERE project_id = ?").run(now(), projectId);
      return view(projectId);
    },
    acknowledgeDownstream: (projectId: string) => {
      requireConfirmedOutline(projectId);
      db.prepare("UPDATE slide_copies SET stale = 0 WHERE project_id = ?").run(projectId);
      for (const slot of loadSlots(db, projectId)) {
        db.prepare("UPDATE slots SET payload_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify({ ...slot, stale: false }), now(), slot.id);
      }
      return view(projectId);
    },
    addSlot: (projectId: string, input: unknown) => {
      const copy = requireCopy(db, projectId);
      if (copy.status !== "confirmed" || copy.stale) throw new AppError("OUTLINE_NOT_APPROVED", "请先确认文字稿，再添加占位。", 409);
      const slot = parseSlot({ ...(input as object), id: randomUUID(), status: "empty", stale: false });
      if (!copy.slides.some((slide) => slide.id === slot.slideId)) throw new AppError("VALIDATION", "占位必须放在现有的一页上。", 400);
      const count = loadSlots(db, projectId).filter((item) => item.slideId === slot.slideId).length;
      if (count >= 8) throw new AppError("VALIDATION", "一页最多 8 个占位，便于逐个绘制和核对。", 400);
      db.prepare("INSERT INTO slots (id, project_id, payload_json, updated_at) VALUES (?, ?, ?, ?)").run(slot.id, projectId, JSON.stringify(slot), now());
      return view(projectId);
    },
    updateSlot: (projectId: string, slotId: string, input: unknown) => {
      const existing = mustSlot(db, projectId, slotId);
      const slot = parseSlot({ ...existing, ...(input as object), id: slotId, status: existing.status, diagramId: existing.diagramId, chart: existing.chart, table: existing.table, imageBase64: existing.imageBase64, resultKind: existing.resultKind });
      db.prepare("UPDATE slots SET payload_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(slot), now(), slotId);
      return view(projectId);
    },
    deleteSlot: (projectId: string, slotId: string) => {
      mustSlot(db, projectId, slotId);
      db.prepare("DELETE FROM slots WHERE id = ? AND project_id = ?").run(slotId, projectId);
      return view(projectId);
    },
    attachDiagram: (projectId: string, slotId: string, diagramId: string) => {
      const slot = mustSlot(db, projectId, slotId);
      const row = db.prepare("SELECT project_id FROM diagrams WHERE id = ?").get(diagramId) as { project_id: string } | undefined;
      if (!row || row.project_id !== projectId) throw new AppError("NOT_FOUND", "没有找到可以放入的图。", 404);
      const next: Slot = { ...slot, diagramId, status: "succeeded", resultKind: "native", stale: false, error: undefined, chart: undefined, table: undefined, imageBase64: undefined };
      db.prepare("UPDATE slots SET payload_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now(), slotId);
      return view(projectId);
    },
    generateSlots: async (projectId: string, input: { slotIds?: string[]; force?: boolean }, hooks?: { afterEach?: (runId: string) => void }) => {
      const copy = requireCopy(db, projectId);
      if (copy.status !== "confirmed" || copy.stale) throw new AppError("OUTLINE_NOT_APPROVED", "文字稿还未确认，或确认后又改过。请先确认文字。", 409);
      const runId = randomUUID();
      db.prepare("INSERT INTO generation_runs (id, project_id, status, created_at) VALUES (?, ?, 'running', ?)").run(runId, projectId, now());
      const selected = new Set(input.slotIds ?? []);
      const targets = loadSlots(db, projectId).filter((slot) => selected.size === 0 || selected.has(slot.id));
      const results: Array<{ id: string; status: "succeeded" | "failed" | "skipped" | "cancelled"; error?: string }> = [];
      for (const slot of targets) {
        const run = db.prepare("SELECT status FROM generation_runs WHERE id = ?").get(runId) as { status: string };
        if (run.status === "cancelled") {
          results.push({ id: slot.id, status: "cancelled" });
          continue;
        }
        if (slot.status === "succeeded" && !input.force) {
          results.push({ id: slot.id, status: "skipped" });
          hooks?.afterEach?.(runId);
          continue;
        }
        try {
          const produced = await produceSlot(slot, mode, db, env, fetchImpl);
          const diagramValue = "diagram" in produced ? produced.diagram : undefined;
          const diagramId = diagramValue ? slot.diagramId ?? randomUUID() : undefined;
          if (diagramValue && diagramId) {
            const diagram = { ...diagramValue, id: diagramId };
            const exists = db.prepare("SELECT id FROM diagrams WHERE id = ?").get(diagramId);
            if (exists) db.prepare("UPDATE diagrams SET ir_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(diagram), now(), diagramId);
            else db.prepare("INSERT INTO diagrams (id, project_id, ir_json, updated_at) VALUES (?, ?, ?, ?)").run(diagramId, projectId, JSON.stringify(diagram), now());
          }
          const next: Slot = {
            ...slot,
            status: "succeeded",
            stale: false,
            error: undefined,
            resultKind: produced.resultKind,
            diagramId,
            chart: "chart" in produced ? produced.chart : undefined,
            table: "table" in produced ? produced.table : undefined,
            imageBase64: "imageBase64" in produced ? produced.imageBase64 : undefined,
          };
          db.prepare("UPDATE slots SET payload_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now(), slot.id);
          results.push({ id: slot.id, status: "succeeded" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "绘制失败。";
          const next: Slot = { ...slot, status: "failed", error: message.slice(0, 300) };
          db.prepare("UPDATE slots SET payload_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now(), slot.id);
          results.push({ id: slot.id, status: "failed", error: next.error });
        }
        hooks?.afterEach?.(runId);
      }
      const finalRun = db.prepare("SELECT status FROM generation_runs WHERE id = ?").get(runId) as { status: string };
      if (finalRun.status === "running") db.prepare("UPDATE generation_runs SET status = 'completed' WHERE id = ?").run(runId);
      return { runId, results, project: view(projectId) };
    },
    cancelRun: (runId: string) => {
      db.prepare("UPDATE generation_runs SET status = 'cancelled' WHERE id = ? AND status = 'running'").run(runId);
    },
    exportProject: async (projectId: string) => {
      const copy = requireCopy(db, projectId);
      requireConfirmedOutline(projectId);
      if (copy.status !== "confirmed" || copy.stale) {
        throw new AppError("OUTLINE_NOT_APPROVED", "文字稿还未确认，或上游改动后还没核对。请确认文字，或明确保留现有内容。", 409);
      }
      const slots = loadSlots(db, projectId);
      if (slots.some((slot) => slot.stale)) {
        throw new AppError("OUTLINE_NOT_APPROVED", "有占位还待核对。可以保留现有占位，或调整后再导出。", 409);
      }
      const deck = toExportDeck(db, view(projectId).project.title, copy.slides, slots);
      const bytes = await buildPptx(deck);
      db.prepare("INSERT INTO export_jobs (id, project_id, deck_id, status, error_code, byte_size, created_at) VALUES (?, ?, ?, 'succeeded', NULL, ?, ?)").run(
        randomUUID(),
        projectId,
        projectId,
        bytes.byteLength,
        now(),
      );
      return bytes;
    },
    getDiagram: (diagramId: string) => loadDiagram(db, diagramId),
    saveDiagram: (input: unknown) => {
      const diagram = parseDiagram(input);
      if (!db.prepare("SELECT id FROM diagrams WHERE id = ?").get(diagram.id)) throw new AppError("NOT_FOUND", "没有找到这张图。", 404);
      const manual = { ...diagram, layout: { ...diagram.layout, algorithm: "manual" as const } };
      db.prepare("UPDATE diagrams SET ir_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(manual), now(), diagram.id);
      return loadDiagram(db, diagram.id);
    },
    relayoutDiagram: (diagramId: string, direction: "TB" | "LR") => {
      const next = layoutDiagram({ ...loadDiagram(db, diagramId), layout: { algorithm: "layered", direction } });
      db.prepare("UPDATE diagrams SET ir_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now(), diagramId);
      return loadDiagram(db, diagramId);
    },
    reseedDiagram: (diagramId: string) => {
      const row = db.prepare("SELECT project_id, ir_json FROM diagrams WHERE id = ?").get(diagramId) as { project_id: string; ir_json: string } | undefined;
      if (!row) throw new AppError("NOT_FOUND", "没有找到这张图。", 404);
      const current = oneVersion(row.project_id, "current");
      const sections = parseOutline(JSON.parse(current.sections_json));
      const section = sections.find((item) => item.diagramId === diagramId) ?? sections.find((item) => item.kind === "diagram");
      if (!section?.bullets || section.bullets.length < 2) throw new AppError("VALIDATION", "大纲里没有足够的节点要点可重排。", 400);
      const next = seedDiagram(diagramId, section.bullets);
      db.prepare("UPDATE diagrams SET ir_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now(), diagramId);
      return loadDiagram(db, diagramId);
    },
  };
}

async function produceSlot(slot: Slot, mode: "demo" | "live", db: DatabaseSync, env: Env, fetchImpl: FetchLike) {
  if (slot.outputType === "illustration") {
    const image = readCapability(db, env, "image");
    if (image.hasKey) {
      const bytes = await generateImage({ baseUrl: image.baseUrl, apiKey: image.apiKey, model: image.model, prompt: `${slot.title}\n${slot.description}\n${slot.instruction}`, fetchImpl });
      return { resultKind: "raster" as const, imageBase64: Buffer.from(bytes).toString("base64") };
    }
    if (mode === "live") throw new AppError("PROVIDER_CONFIG", "在线模式绘制插图需要单独配置插图接口，不会改用演示位图。", 400);
    return { resultKind: "raster" as const, imageBase64: Buffer.from(demoPngBytes()).toString("base64") };
  }
  if (mode === "live") return liveNative(slot, db, env, fetchImpl);
  const semantic = semanticFromSlot(slot);
  if ("diagram" in semantic) return { resultKind: "native" as const, diagram: semantic.diagram };
  if ("chart" in semantic) return { resultKind: "native" as const, chart: semantic.chart };
  if ("table" in semantic) return { resultKind: "native" as const, table: semantic.table };
  return { resultKind: "raster" as const, imageBase64: semantic.imageBase64 || DEMO_PNG_BASE64 };
}

async function liveNative(slot: Slot, db: DatabaseSync, env: Env, fetchImpl: FetchLike) {
  const text = readCapability(db, env, "text");
  if (!text.hasKey) throw new AppError("PROVIDER_CONFIG", "在线绘制需要文本接口。没有配置时不会改用演示数据。", 400);
  const payload = await chatJson({
    baseUrl: text.baseUrl,
    apiKey: text.apiKey,
    model: text.model,
    fetchImpl,
    system: "只返回 JSON。图：{\"labels\":[\"甲\",\"乙\"]}。图表：{\"categories\":[\"一月\"],\"values\":[10]}。表格：{\"headers\":[\"甲\",\"乙\"],\"rows\":[[\"1\",\"2\"]]}。",
    user: `类型 ${slot.outputType}\n标题 ${slot.title}\n描述 ${slot.description}\n说明 ${slot.instruction}`,
  });
  if (slot.outputType.startsWith("diagram-")) {
    const labels = (payload as { labels?: unknown }).labels;
    if (!Array.isArray(labels) || labels.length < 2 || labels.some((item) => typeof item !== "string")) {
      throw new AppError("PROVIDER_SCHEMA", "模型没有返回至少两个图节点。", 422);
    }
    const intent = slot.outputType === "diagram-org" ? "org" : slot.outputType === "diagram-architecture" ? "architecture" : slot.outputType === "diagram-relation" ? "relation" : "flow";
    return { resultKind: "native" as const, diagram: seedByIntent(slot.id, labels as string[], intent, { x: slot.x, y: slot.y, w: slot.w, h: slot.h }) };
  }
  if (slot.outputType.startsWith("chart-")) {
    const body = payload as { categories?: unknown; values?: unknown };
    if (!Array.isArray(body.categories) || !Array.isArray(body.values) || body.categories.length !== body.values.length) {
      throw new AppError("PROVIDER_SCHEMA", "模型返回的图表类别和数值不一致。", 422);
    }
    const type: "bar" | "line" | "pie" = slot.outputType === "chart-line" ? "line" : slot.outputType === "chart-pie" ? "pie" : "bar";
    return { resultKind: "native" as const, chart: { type, categories: body.categories as string[], series: [{ name: slot.title, values: (body.values as number[]).map(Number) }] } };
  }
  const body = payload as { headers?: unknown; rows?: unknown };
  if (!Array.isArray(body.headers) || !Array.isArray(body.rows)) throw new AppError("PROVIDER_SCHEMA", "模型没有返回表格。", 422);
  return { resultKind: "native" as const, table: { headers: body.headers as string[], rows: body.rows as string[][] } };
}

function requireCopy(db: DatabaseSync, projectId: string): { status: "draft" | "confirmed"; stale: boolean; slides: SlideCopy[] } {
  const copy = db.prepare("SELECT status, stale, slides_json FROM slide_copies WHERE project_id = ?").get(projectId) as
    | { status: "draft" | "confirmed"; stale: number; slides_json: string }
    | undefined;
  if (!copy) throw new AppError("OUTLINE_NOT_APPROVED", "还没有幻灯片文字。请先生成并确认文字。", 409);
  return { status: copy.status, stale: copy.stale === 1, slides: JSON.parse(copy.slides_json) as SlideCopy[] };
}

function loadSlots(db: DatabaseSync, projectId: string): Slot[] {
  const rows = db.prepare("SELECT payload_json FROM slots WHERE project_id = ? ORDER BY updated_at").all(projectId) as Array<{ payload_json: string }>;
  return rows.map((row) => JSON.parse(row.payload_json) as Slot);
}

function mustSlot(db: DatabaseSync, projectId: string, slotId: string): Slot {
  const row = db.prepare("SELECT payload_json FROM slots WHERE id = ? AND project_id = ?").get(slotId, projectId) as { payload_json: string } | undefined;
  if (!row) throw new AppError("NOT_FOUND", "没有找到这个占位。", 404);
  return JSON.parse(row.payload_json) as Slot;
}

function toCopy(section: OutlineSection): SlideCopy {
  if (section.kind === "title") return { id: section.id, title: section.title, lines: section.subtitle ? [section.subtitle] : [] };
  if (section.kind === "table") return { id: section.id, title: section.title, lines: section.table?.rows.map((row) => row.join(" / ")) ?? [] };
  if (section.kind === "chart") {
    return {
      id: section.id,
      title: section.title,
      lines: section.chart?.categories.map((category, index) => `${category} ${section.chart?.series[0]?.values[index] ?? ""}`.trim()) ?? [],
    };
  }
  return { id: section.id, title: section.title, lines: section.bullets ?? [] };
}

function loadDiagram(db: DatabaseSync, diagramId: string): Diagram {
  const row = db.prepare("SELECT ir_json FROM diagrams WHERE id = ?").get(diagramId) as { ir_json: string } | undefined;
  if (!row) throw new AppError("NOT_FOUND", "没有找到这张图。", 404);
  return parseDiagram(JSON.parse(row.ir_json));
}

function labelOf(json: string): string {
  try {
    const diagram = JSON.parse(json) as Diagram;
    return diagram.nodes[0]?.label ?? diagram.id;
  } catch {
    return "图";
  }
}

function toExportDeck(db: DatabaseSync, title: string, slides: SlideCopy[], slots: Slot[]): ExportDeck {
  return {
    title,
    slides: slides.map((slide) => ({
      kind: "composed" as const,
      title: slide.title,
      lines: slide.lines,
      slots: slots.filter((slot) => slot.slideId === slide.id).map((slot) => toComposed(db, slot)),
    })),
  };
}

function toComposed(db: DatabaseSync, slot: Slot): ComposedSlot {
  const frame = { id: slot.id, x: slot.x, y: slot.y, w: slot.w, h: slot.h };
  if (slot.status === "succeeded" && slot.resultKind === "native" && slot.diagramId) {
    return { ...frame, mode: "diagram", diagram: loadDiagram(db, slot.diagramId) };
  }
  if (slot.status === "succeeded" && slot.chart) return { ...frame, mode: "chart", chart: slot.chart };
  if (slot.status === "succeeded" && slot.table) return { ...frame, mode: "table", table: slot.table };
  if (slot.status === "succeeded" && slot.resultKind === "raster" && slot.imageBase64) {
    return { ...frame, mode: "illustration", pngBase64: slot.imageBase64, title: slot.title };
  }
  return { ...frame, mode: "placeholder", title: slot.title, outputType: slot.outputType, description: slot.description, instruction: slot.instruction };
}

export type Services = ReturnType<typeof createServices>;

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { OutlineProvider } from "../ai/provider";
import { AppError } from "../domain/errors";
import { layoutDiagram, seedDiagram } from "../domain/layout";
import type { ChartSpec, Diagram, OutlineSection, SourceKind, TableSpec } from "../domain/types";
import { LIMITS } from "../domain/types";
import { parseDiagram, parseOutline, parseSourceText } from "../domain/validate";
import { buildPptx, type ExportDeck } from "../pptx/build";

export type DeckSlide =
  | { id: string; kind: "title"; title: string; subtitle?: string }
  | { id: string; kind: "bullets"; title: string; bullets: string[] }
  | { id: string; kind: "table"; title: string; headers: string[]; rows: string[][] }
  | { id: string; kind: "diagram"; title: string; diagramId: string }
  | { id: string; kind: "chart"; title: string; chart: ChartSpec };

export type ProjectView = {
  mode: "demo" | "live";
  project: { id: string; title: string; sourceKind: SourceKind; sourceText: string };
  outline: { versionId: string; versionNo: number; status: "draft" | "approved"; sections: OutlineSection[] };
  candidate: null | { versionId: string; versionNo: number; sections: OutlineSection[] };
  deck: null | { id: string; stale: boolean; slides: DeckSlide[] };
};

type VersionRow = {
  id: string;
  project_id: string;
  version_no: number;
  status: "draft" | "approved";
  role: "current" | "candidate" | "archived";
  sections_json: string;
};

export function createServices(db: DatabaseSync, provider: OutlineProvider, mode: "demo" | "live") {
  const now = () => new Date().toISOString();

  const view = (projectId: string): ProjectView => {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
      | { id: string; title: string; source_kind: SourceKind; source_text: string }
      | undefined;
    if (!project) throw new AppError("NOT_FOUND", "没有找到这份文稿。", 404);
    const current = oneVersion(projectId, "current");
    const candidate = db.prepare("SELECT * FROM outline_versions WHERE project_id = ? AND role = 'candidate'").get(projectId) as VersionRow | undefined;
    const deck = db.prepare("SELECT * FROM decks WHERE project_id = ?").get(projectId) as
      | { id: string; stale: number; slides_json: string }
      | undefined;
    return {
      mode,
      project: { id: project.id, title: project.title, sourceKind: project.source_kind, sourceText: project.source_text },
      outline: { versionId: current.id, versionNo: current.version_no, status: current.status, sections: parseOutline(JSON.parse(current.sections_json)) },
      candidate: candidate
        ? { versionId: candidate.id, versionNo: candidate.version_no, sections: parseOutline(JSON.parse(candidate.sections_json)) }
        : null,
      deck: deck ? { id: deck.id, stale: deck.stale === 1, slides: JSON.parse(deck.slides_json) as DeckSlide[] } : null,
    };
  };

  const oneVersion = (projectId: string, role: "current" | "candidate"): VersionRow => {
    const row = db.prepare("SELECT * FROM outline_versions WHERE project_id = ? AND role = ?").get(projectId, role) as VersionRow | undefined;
    if (!row) throw new AppError("NOT_FOUND", role === "candidate" ? "没有待处理的优化。" : "没有找到大纲。", 404);
    return row;
  };

  const nextVersionNo = (projectId: string) => {
    const row = db.prepare("SELECT COALESCE(MAX(version_no), 0) AS n FROM outline_versions WHERE project_id = ?").get(projectId) as { n: number };
    return Number(row.n) + 1;
  };

  const archiveRole = (projectId: string, role: "current" | "candidate") => {
    db.prepare("UPDATE outline_versions SET role = 'archived' WHERE project_id = ? AND role = ?").run(projectId, role);
  };

  return {
    mode,
    createProject: async (input: { sourceKind: SourceKind; sourceText: string }) => {
      if (input.sourceKind !== "topic" && input.sourceKind !== "paste") {
        throw new AppError("VALIDATION", "来源只能是主题或粘贴内容。", 400);
      }
      const sourceText = parseSourceText(input.sourceText);
      const sections = parseOutline(await provider.generate({ sourceKind: input.sourceKind, sourceText }));
      const id = randomUUID();
      const versionId = randomUUID();
      const title = sections[0]?.title ?? "未命名文稿";
      db.prepare("INSERT INTO projects (id, title, source_kind, source_text, created_at) VALUES (?, ?, ?, ?, ?)").run(
        id,
        title,
        input.sourceKind,
        sourceText,
        now(),
      );
      db.prepare(
        "INSERT INTO outline_versions (id, project_id, version_no, status, role, sections_json, created_at) VALUES (?, ?, 1, 'draft', 'current', ?, ?)",
      ).run(versionId, id, JSON.stringify(sections), now());
      return view(id);
    },
    getProject: (projectId: string) => view(projectId),
    updateOutline: async (projectId: string, sectionsInput: unknown) => {
      const sections = parseOutline(sectionsInput);
      const current = oneVersion(projectId, "current");
      if (JSON.parse(current.sections_json) && current.status === "approved") {
        db.prepare("UPDATE decks SET stale = 1 WHERE project_id = ?").run(projectId);
      }
      archiveRole(projectId, "candidate");
      archiveRole(projectId, "current");
      db.prepare(
        "INSERT INTO outline_versions (id, project_id, version_no, status, role, sections_json, created_at) VALUES (?, ?, ?, 'draft', 'current', ?, ?)",
      ).run(randomUUID(), projectId, nextVersionNo(projectId), JSON.stringify(sections), now());
      const title = sections[0]?.title;
      if (title) db.prepare("UPDATE projects SET title = ? WHERE id = ?").run(title, projectId);
      return view(projectId);
    },
    optimize: async (projectId: string, input: { instruction: string; sectionId?: string }) => {
      const instruction = input.instruction.trim();
      if (!instruction || instruction.length > LIMITS.instruction) {
        throw new AppError("VALIDATION", `优化说明需要 1 到 ${LIMITS.instruction} 个字。`, 400);
      }
      const current = oneVersion(projectId, "current");
      const sections = parseOutline(
        await provider.optimize({ sections: parseOutline(JSON.parse(current.sections_json)), instruction, sectionId: input.sectionId }),
      );
      archiveRole(projectId, "candidate");
      db.prepare(
        "INSERT INTO outline_versions (id, project_id, version_no, status, role, sections_json, created_at) VALUES (?, ?, ?, 'draft', 'candidate', ?, ?)",
      ).run(randomUUID(), projectId, nextVersionNo(projectId), JSON.stringify(sections), now());
      return view(projectId);
    },
    acceptOptimization: (projectId: string) => {
      oneVersion(projectId, "candidate");
      archiveRole(projectId, "current");
      db.prepare("UPDATE outline_versions SET role = 'current', status = 'draft' WHERE project_id = ? AND role = 'candidate'").run(projectId);
      db.prepare("UPDATE decks SET stale = 1 WHERE project_id = ?").run(projectId);
      const current = oneVersion(projectId, "current");
      const sections = parseOutline(JSON.parse(current.sections_json));
      if (sections[0]?.title) db.prepare("UPDATE projects SET title = ? WHERE id = ?").run(sections[0].title, projectId);
      return view(projectId);
    },
    discardOptimization: (projectId: string) => {
      oneVersion(projectId, "candidate");
      archiveRole(projectId, "candidate");
      return view(projectId);
    },
    approveAndMaterialize: async (projectId: string) => {
      if (db.prepare("SELECT id FROM outline_versions WHERE project_id = ? AND role = 'candidate'").get(projectId)) {
        throw new AppError("VALIDATION", "还有未处理的优化。请先采用或放弃。", 400);
      }
      const current = oneVersion(projectId, "current");
      const sections = parseOutline(JSON.parse(current.sections_json));
      for (const section of sections) {
        if (section.kind === "diagram" && !section.diagramId) {
          const id = randomUUID();
          const diagram = seedDiagram(id, section.bullets ?? []);
          db.prepare("INSERT INTO diagrams (id, project_id, ir_json, updated_at) VALUES (?, ?, ?, ?)").run(
            id,
            projectId,
            JSON.stringify(diagram),
            now(),
          );
          section.diagramId = id;
        }
      }
      db.prepare("UPDATE outline_versions SET status = 'approved', sections_json = ? WHERE id = ?").run(JSON.stringify(sections), current.id);
      const slides: DeckSlide[] = sections.map((section) => toSlide(section));
      const existing = db.prepare("SELECT id FROM decks WHERE project_id = ?").get(projectId) as { id: string } | undefined;
      if (existing) {
        db.prepare("UPDATE decks SET outline_version_id = ?, stale = 0, slides_json = ?, created_at = ? WHERE id = ?").run(
          current.id,
          JSON.stringify(slides),
          now(),
          existing.id,
        );
      } else {
        db.prepare(
          "INSERT INTO decks (id, project_id, outline_version_id, stale, slides_json, created_at) VALUES (?, ?, ?, 0, ?, ?)",
        ).run(randomUUID(), projectId, current.id, JSON.stringify(slides), now());
      }
      return view(projectId);
    },
    getDiagram: (diagramId: string) => loadDiagram(db, diagramId),
    saveDiagram: (input: unknown) => {
      const diagram = parseDiagram(input);
      const existing = db.prepare("SELECT id FROM diagrams WHERE id = ?").get(diagram.id);
      if (!existing) throw new AppError("NOT_FOUND", "没有找到这张图。", 404);
      const manual = { ...diagram, layout: { ...diagram.layout, algorithm: "manual" as const } };
      db.prepare("UPDATE diagrams SET ir_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(manual), now(), diagram.id);
      return loadDiagram(db, diagram.id);
    },
    relayoutDiagram: (diagramId: string, direction: "TB" | "LR") => {
      const diagram = loadDiagram(db, diagramId);
      const next = layoutDiagram({ ...diagram, layout: { algorithm: "layered", direction } });
      db.prepare("UPDATE diagrams SET ir_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now(), diagramId);
      return loadDiagram(db, diagramId);
    },
    reseedDiagram: (diagramId: string) => {
      const row = db.prepare("SELECT project_id FROM diagrams WHERE id = ?").get(diagramId) as { project_id: string } | undefined;
      if (!row) throw new AppError("NOT_FOUND", "没有找到这张图。", 404);
      const current = oneVersion(row.project_id, "current");
      const sections = parseOutline(JSON.parse(current.sections_json));
      const section = sections.find((item) => item.diagramId === diagramId);
      if (!section?.bullets || section.bullets.length < 2) {
        throw new AppError("VALIDATION", "当前大纲里找不到这张图的要点，无法重排。", 400);
      }
      const next = seedDiagram(diagramId, section.bullets);
      db.prepare("UPDATE diagrams SET ir_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now(), diagramId);
      return loadDiagram(db, diagramId);
    },
    exportProject: async (projectId: string) => {
      const current = view(projectId);
      if (current.outline.status !== "approved" || !current.deck || current.deck.stale) {
        throw new AppError("OUTLINE_NOT_APPROVED", "大纲还没批准，或批准后又改过。请重新批准并生成预览。", 409);
      }
      const deck = toExportDeck(db, current.project.title, current.deck.slides);
      try {
        const bytes = await buildPptx(deck);
        db.prepare(
          "INSERT INTO export_jobs (id, project_id, deck_id, status, error_code, byte_size, created_at) VALUES (?, ?, ?, 'succeeded', NULL, ?, ?)",
        ).run(randomUUID(), projectId, current.deck.id, bytes.byteLength, now());
        return bytes;
      } catch (error) {
        const code = error instanceof AppError ? error.code : "INTERNAL";
        db.prepare(
          "INSERT INTO export_jobs (id, project_id, deck_id, status, error_code, byte_size, created_at) VALUES (?, ?, ?, 'failed', ?, NULL, ?)",
        ).run(randomUUID(), projectId, current.deck.id, code, now());
        throw error;
      }
    },
  };
}

function toSlide(section: OutlineSection): DeckSlide {
  if (section.kind === "title") return { id: section.id, kind: "title", title: section.title, subtitle: section.subtitle };
  if (section.kind === "bullets") return { id: section.id, kind: "bullets", title: section.title, bullets: section.bullets ?? [] };
  if (section.kind === "table") {
    const table = section.table as TableSpec;
    return { id: section.id, kind: "table", title: section.title, headers: table.headers, rows: table.rows };
  }
  if (section.kind === "diagram") return { id: section.id, kind: "diagram", title: section.title, diagramId: section.diagramId ?? "" };
  return { id: section.id, kind: "chart", title: section.title, chart: section.chart as ChartSpec };
}

function loadDiagram(db: DatabaseSync, diagramId: string): Diagram {
  const row = db.prepare("SELECT ir_json FROM diagrams WHERE id = ?").get(diagramId) as { ir_json: string } | undefined;
  if (!row) throw new AppError("NOT_FOUND", "没有找到这张图。", 404);
  return parseDiagram(JSON.parse(row.ir_json));
}

function toExportDeck(db: DatabaseSync, title: string, slides: DeckSlide[]): ExportDeck {
  return {
    title,
    slides: slides.map((slide) => {
      if (slide.kind === "diagram") {
        if (!slide.diagramId) throw new AppError("DIAGRAM_NOT_FOUND", "这张流程图还没有图数据。", 422);
        return { kind: "diagram", title: slide.title, diagram: loadDiagram(db, slide.diagramId) };
      }
      if (slide.kind === "chart") return { kind: "chart", title: slide.title, chart: slide.chart };
      if (slide.kind === "table") return { kind: "table", title: slide.title, headers: slide.headers, rows: slide.rows };
      if (slide.kind === "bullets") return { kind: "bullets", title: slide.title, bullets: slide.bullets };
      return { kind: "title", title: slide.title, subtitle: slide.subtitle };
    }),
  };
}

export type Services = ReturnType<typeof createServices>;

import { describe, expect, it } from "vitest";
import { resolveProvider } from "../src/ai/provider";
import { openDatabase } from "../src/db/database";
import { createServices } from "../src/server/service";

function services() {
  const db = openDatabase(":memory:");
  const resolved = resolveProvider({});
  return createServices(db, resolved.provider, resolved.mode);
}

describe("project workflow", () => {
  it("keeps an edited outline after it is read again", async () => {
    const api = services();
    const created = await api.createProject({ sourceKind: "topic", sourceText: "社区图书角试点" });
    const renamed = created.outline.sections.map((section, index) =>
      index === 0 ? { ...section, title: "改过的标题" } : section,
    );
    await api.updateOutline(created.project.id, renamed);
    const again = api.getProject(created.project.id);
    expect(again.outline.sections[0]?.title).toBe("改过的标题");
    expect(again.outline.status).toBe("draft");
  });

  it("accepts an optimization candidate and can discard another one", async () => {
    const api = services();
    const created = await api.createProject({ sourceKind: "paste", sourceText: "已有一段试点记录" });
    const optimized = await api.optimize(created.project.id, { instruction: "把表述收紧" });
    expect(optimized.candidate?.sections.some((section) => section.title.endsWith("（收紧）"))).toBe(true);
    const discarded = api.discardOptimization(created.project.id);
    expect(discarded.candidate).toBeNull();
    expect(discarded.outline.sections[0]?.title.endsWith("（收紧）")).toBe(false);

    await api.optimize(created.project.id, { instruction: "把表述收紧", sectionId: created.outline.sections[1]?.id });
    const accepted = api.acceptOptimization(created.project.id);
    expect(accepted.candidate).toBeNull();
    expect(accepted.outline.status).toBe("draft");
    expect(accepted.outline.sections[1]?.title.endsWith("（收紧）")).toBe(true);
  });

  it("blocks export after an approved outline is edited", async () => {
    const api = services();
    const created = await api.createProject({ sourceKind: "topic", sourceText: "社区图书角试点" });
    const ready = await api.approveAndMaterialize(created.project.id);
    expect(ready.deck?.stale).toBe(false);
    const pptx = await api.exportProject(created.project.id);
    expect(pptx.byteLength).toBeGreaterThan(1000);

    const edited = ready.outline.sections.map((section, index) =>
      index === 0 ? { ...section, title: "又改了" } : section,
    );
    await api.updateOutline(created.project.id, edited);
    await expect(api.exportProject(created.project.id)).rejects.toMatchObject({ code: "OUTLINE_NOT_APPROVED" });
  });

  it("reloads a diagram label saved from the shared id", async () => {
    const api = services();
    const created = await api.createProject({ sourceKind: "topic", sourceText: "社区图书角试点" });
    const ready = await api.approveAndMaterialize(created.project.id);
    const diagramSlide = ready.deck?.slides.find((slide) => slide.kind === "diagram");
    expect(diagramSlide && "diagramId" in diagramSlide && diagramSlide.diagramId).toBeTruthy();
    const diagramId = diagramSlide && "diagramId" in diagramSlide ? diagramSlide.diagramId : "";
    const diagram = api.getDiagram(diagramId);
    const saved = api.saveDiagram({
      ...diagram,
      nodes: diagram.nodes.map((node, index) => (index === 0 ? { ...node, label: "到馆登记" } : node)),
    });
    expect(api.getDiagram(diagramId).nodes[0]?.label).toBe("到馆登记");
    expect(saved.id).toBe(diagramId);
  });

  it("rejects a diagram edge that points nowhere", async () => {
    const api = services();
    const created = await api.createProject({ sourceKind: "topic", sourceText: "社区图书角试点" });
    const ready = await api.approveAndMaterialize(created.project.id);
    const diagramSlide = ready.deck?.slides.find((slide) => slide.kind === "diagram");
    const diagramId = diagramSlide && "diagramId" in diagramSlide ? diagramSlide.diagramId : "";
    const diagram = api.getDiagram(diagramId);
    expect(() =>
      api.saveDiagram({
        ...diagram,
        edges: diagram.edges.map((edge, index) => (index === 0 ? { ...edge, target: "missing" } : edge)),
      }),
    ).toThrowError(expect.objectContaining({ code: "DANGLING_EDGE" }));
  });
});

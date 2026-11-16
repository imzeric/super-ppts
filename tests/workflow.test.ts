import { describe, expect, it, vi } from "vitest";
import { resolveProvider } from "../src/ai/provider";
import { openDatabase } from "../src/db/database";
import { createServices } from "../src/server/service";
import { clearCapabilityKey, listCapabilities, saveCapability } from "../src/ai/credentials";

function services(mode?: "demo" | "live") {
  const db = openDatabase(":memory:");
  const resolved = resolveProvider(mode === "live" ? { AI_API_KEY: "KEY123", AI_BASE_URL: "https://example.test/v1", AI_MODEL: "m" } : {});
  return { db, api: createServices(db, resolved.provider, resolved.mode, { env: {} }) };
}

async function ready(api: ReturnType<typeof services>["api"]) {
  const created = await api.createProject({ background: "社区图书角试点" });
  api.confirmOutline(created.project.id);
  api.generateCopy(created.project.id);
  api.confirmCopy(created.project.id);
  return created.project.id;
}

describe("four stage workflow", () => {
  it("saves markdown and reloads it", async () => {
    const { api } = services();
    const created = await api.createProject({ background: "社区图书角试点" });
    const edited = created.outline.markdown.replace("# 社区图书角三个月试点", "# 社区图书角试点汇报");
    api.updateMarkdown(created.project.id, edited);
    expect(api.getProject(created.project.id).outline.markdown).toContain("# 社区图书角试点汇报");
    expect(api.getProject(created.project.id).outline.status).toBe("draft");
  });

  it("accepts an optimization without deleting later placeholders", async () => {
    const { api } = services();
    const id = await ready(api);
    const slideId = api.getProject(id).copy?.slides[3]?.id ?? "";
    api.addSlot(id, slotInput(slideId));
    const before = api.getProject(id).slots[0]?.id;
    await api.optimize(id, { instruction: "收紧", headingId: "sec-bullets" });
    api.acceptOptimization(id);
    const view = api.getProject(id);
    expect(view.outline.status).toBe("draft");
    expect(view.slots[0]?.id).toBe(before);
    expect(view.slots[0]?.x).toBe(540000);
    expect(view.slots[0]?.stale).toBe(true);
    expect(view.copy?.stale).toBe(true);
  });

  it("keeps a successful slot when a later slot fails and is retried", async () => {
    const { api } = services();
    const id = await ready(api);
    const slideId = api.getProject(id).copy?.slides[3]?.id ?? "";
    api.addSlot(id, slotInput(slideId, { title: "流程", description: "到馆登记\n挑选图书" }));
    api.addSlot(id, slotInput(slideId, { title: "坏图表", outputType: "chart-bar", description: "没有数字", x: 4_000_000 }));
    const [first, second] = api.getProject(id).slots;
    const once = await api.generateSlots(id, { slotIds: [first!.id, second!.id] });
    expect(once.results.map((item) => item.status)).toEqual(["succeeded", "failed"]);
    const diagramId = api.getProject(id).slots[0]?.diagramId;
    const twice = await api.generateSlots(id, { slotIds: [first!.id, second!.id] });
    expect(twice.results[0]?.status).toBe("skipped");
    expect(api.getProject(id).slots[0]?.diagramId).toBe(diagramId);
    api.updateSlot(id, second!.id, { description: "一月 10\n二月 16" });
    const retried = await api.generateSlots(id, { slotIds: api.getProject(id).slots.filter((slot) => slot.status === "failed").map((slot) => slot.id) });
    expect(retried.results[0]?.status).toBe("succeeded");
    expect(api.getProject(id).slots[0]?.diagramId).toBe(diagramId);
    expect(api.getProject(id).slots[1]?.chart?.series[0]?.values).toEqual([10, 16]);
  });

  it("cancels before the next slot and leaves it untouched", async () => {
    const { api } = services();
    const id = await ready(api);
    const slideId = api.getProject(id).copy?.slides[0]?.id ?? "";
    api.addSlot(id, slotInput(slideId, { outputType: "illustration", description: "封面插画" }));
    api.addSlot(id, slotInput(slideId, { title: "第二张", outputType: "illustration", description: "另一张", x: 4_000_000 }));
    const ids = api.getProject(id).slots.map((slot) => slot.id);
    const result = await api.generateSlots(id, { slotIds: ids }, { afterEach: (runId) => api.cancelRun(runId) });
    expect(result.results.map((item) => item.status)).toEqual(["succeeded", "cancelled"]);
    const cancelledId = result.results.find((item) => item.status === "cancelled")?.id;
    expect(api.getProject(id).slots.find((slot) => slot.id === cancelledId)?.status).toBe("empty");
  });

  it("exports a placeholder shape before drawing and blocks export after the outline changes", async () => {
    const { api } = services();
    const id = await ready(api);
    const slideId = api.getProject(id).copy?.slides[3]?.id ?? "";
    api.addSlot(id, slotInput(slideId));
    const bytes = await api.exportProject(id);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    api.updateMarkdown(id, api.getProject(id).outline.markdown.replace("开场", "开场改"));
    await expect(api.exportProject(id)).rejects.toMatchObject({ code: "OUTLINE_NOT_APPROVED" });
    expect(api.getProject(id).slots).toHaveLength(1);
  });

  it("does not return a saved key and does not clear it on a blank update", () => {
    const { db } = services();
    saveCapability(db, { capability: "text", baseUrl: "https://example.test/v1", model: "m", apiKey: "super-secret-key" });
    const listed = JSON.stringify(listCapabilities(db, {}));
    expect(listed.includes("super-secret-key")).toBe(false);
    expect(listed.includes("ey")).toBe(true);
    saveCapability(db, { capability: "text", baseUrl: "https://example.test/v1", model: "m2", apiKey: "  " });
    const stored = db.prepare("SELECT api_key, model FROM provider_profiles WHERE capability = 'text'").get() as { api_key: string; model: string };
    expect(stored.api_key).toBe("super-secret-key");
    expect(stored.model).toBe("m2");
    clearCapabilityKey(db, "text");
    expect((db.prepare("SELECT api_key FROM provider_profiles WHERE capability = 'text'").get() as { api_key: string }).api_key).toBe("");
  });
});

function slotInput(slideId: string, extra: Record<string, unknown> = {}) {
  return {
    slideId,
    x: 540_000,
    y: 1_200_000,
    w: 3_200_000,
    h: 2_400_000,
    title: "借阅流程",
    description: "到馆登记\n挑选图书",
    instruction: "自上而下",
    outputType: "diagram-flow",
    ...extra,
  };
}

void vi;

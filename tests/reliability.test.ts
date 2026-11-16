import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { assertResolvedProviderUrl } from "../src/ai/guard";
import { resolveProvider } from "../src/ai/provider";
import { openDatabase, withTransaction } from "../src/db/database";
import { redactSecrets } from "../src/server/redact";
import { createDurableJob } from "../src/server/workerClient";
import { createServices } from "../src/server/service";

describe("reliability guards", () => {
  it("rolls back a failed transaction and a failed workspace replace", async () => {
    const db = openDatabase(":memory:");
    expect(() => withTransaction(db, () => {
      db.prepare("INSERT INTO projects (id, title, source_kind, source_text, created_at) VALUES ('p', 't', 'background', 'x', 'now')").run();
      throw new Error("boom");
    })).toThrow("boom");
    expect((db.prepare("SELECT COUNT(*) AS n FROM projects").get() as { n: number }).n).toBe(0);

    const api = createServices(db, resolveProvider({}).provider, "demo");
    const created = await api.createProject({ background: "社区图书角试点" });
    api.confirmOutline(created.project.id);
    api.confirmDeck(created.project.id);
    api.generateCopy(created.project.id);
    api.confirmCopy(created.project.id);
    const slides = api.getProject(created.project.id).copy?.slides ?? [];
    const slot = {
      id: "same-slot",
      slideId: slides[0]?.id,
      x: 540000,
      y: 1200000,
      w: 3200000,
      h: 2400000,
      title: "借阅流程",
      description: "到馆登记\n挑选图书",
      instruction: "自上而下",
      outputType: "diagram-flow",
    };
    expect(() => api.saveWorkspace(created.project.id, { slides, slots: [slot, slot] })).toThrow();
    expect(api.getProject(created.project.id).slots).toHaveLength(0);
    expect(api.getProject(created.project.id).copy?.slides[0]?.title).toBe(slides[0]?.title);
  });

  it("does not reseed a diagram from an unrelated outline section", async () => {
    const db = openDatabase(":memory:");
    const api = createServices(db, resolveProvider({}).provider, "demo");
    const created = await api.createProject({ background: "社区图书角试点" });
    const before = JSON.stringify({ id: "other-diagram", version: 1, nodes: [], edges: [] });
    db.prepare("INSERT INTO diagrams (id, project_id, ir_json, updated_at) VALUES (?, ?, ?, ?)").run("other-diagram", created.project.id, before, "now");
    expect(() => api.reseedDiagram("other-diagram")).toThrow(/不会改用其他节/);
    expect((db.prepare("SELECT ir_json FROM diagrams WHERE id = 'other-diagram'").get() as { ir_json: string }).ir_json).toBe(before);
  });

  it("rejects a stale generation result and redacts secrets", async () => {
    expect(redactSecrets("Bearer super-secret-key sk-abcdefghijklmnop", ["super-secret-key"])).not.toMatch(/super-secret-key|sk-abc/);
    const db = openDatabase(":memory:");
    const fetchImpl = async () => {
      throw new Error("socket reset KEY123");
    };
    const api = createServices(db, resolveProvider({}).provider, "live", {
      env: { AI_TEXT_API_KEY: "KEY123", AI_TEXT_BASE_URL: "https://1.1.1.1/v1", AI_TEXT_MODEL: "m" },
      fetchImpl,
    });
    const created = await api.createProject({ background: "社区图书角试点" });
    api.confirmOutline(created.project.id);
    api.confirmDeck(created.project.id);
    api.generateCopy(created.project.id);
    api.confirmCopy(created.project.id);
    const slideId = api.getProject(created.project.id).copy?.slides[0]?.id ?? "";
    api.addSlot(created.project.id, {
      slideId,
      x: 540000,
      y: 1200000,
      w: 3200000,
      h: 2400000,
      title: "借阅流程",
      description: "到馆登记\n挑选图书",
      instruction: "自上而下",
      outputType: "diagram-flow",
    });
    const slot = api.getProject(created.project.id).slots[0];
    const version = (db.prepare("SELECT updated_at FROM slots WHERE id = ?").get(slot?.id) as { updated_at: string }).updated_at;
    await expect(api.executeJobItem(created.project.id, { slotId: slot!.id, expectedVersion: "old" })).rejects.toMatchObject({ code: "STALE_SLOT" });
    expect(api.getProject(created.project.id).slots[0]?.status).toBe("empty");
    const failed = await api.executeJobItem(created.project.id, { slotId: slot!.id, expectedVersion: version });
    expect(failed.status).toBe("failed");
    expect(JSON.stringify(failed)).not.toContain("KEY123");
    expect(api.getProject(created.project.id).slots[0]?.error ?? "").not.toContain("KEY123");
  });

  it("rejects a public name that resolves to a metadata address", async () => {
    await expect(assertResolvedProviderUrl("https://public.example/v1", [], async () => ["169.254.169.254"])).rejects.toThrow(/元数据/);
    await expect(assertResolvedProviderUrl("https://public.example/v1", [], async () => ["1.1.1.1"])).resolves.toContain("https://public.example");
  });

  it("treats a mismatched worker contract as an error", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ contractVersion: 2, jobId: "job", projectId: "p", status: "queued", items: [] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    process.env.WORKER_URL = `http://127.0.0.1:${address.port}`;
    process.env.INTERNAL_SERVICE_TOKEN = "token";
    await expect(createDurableJob({
      projectId: "project-1",
      idempotencyKey: "idem-key-1",
      items: [{ slotId: "slot-1", slotVersion: "v1" }],
    })).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
});

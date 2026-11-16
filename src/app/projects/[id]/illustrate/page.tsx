"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type ProjectView } from "@/lib/model";

type JobItem = { slotId: string; status: string; errorMessage?: string | null };
type JobState = { jobId: string; status: string; items: JobItem[] };

const ACTIVE = new Set(["queued", "running", "cancelling"]);

export default function IllustratePage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [runId, setRunId] = useState("");
  const [watch, setWatch] = useState(0);
  const [job, setJob] = useState<JobState | null>(null);

  function load() {
    return fetch(`/api/projects/${params.id}`).then((response) => readJson<ProjectView>(response)).then(setView);
  }

  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    async function poll() {
      const response = await fetch(`/api/projects/${params.id}/generate/${runId}`);
      const body = (await response.json()) as JobState & { message?: string };
      if (!response.ok) throw new Error(body.message || "没有查到绘制进度。");
      if (stopped) return;
      setJob(body);
      setNotice(describeJob(body));
      if (!ACTIVE.has(body.status)) {
        await load();
        return;
      }
      window.setTimeout(() => void poll().catch((reason: Error) => setError(reason.message)), 400);
    }
    void poll().catch((reason: Error) => setError(reason.message));
    return () => {
      stopped = true;
    };
  }, [runId, watch, params.id]);

  async function generate(slotIds: string[]) {
    setError("");
    const response = await fetch(`/api/projects/${params.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ slotIds }),
    });
    const body = (await response.json()) as { runId?: string; jobId?: string; message?: string };
    if (response.status === 409 && body.jobId) {
      setRunId(body.jobId);
      setWatch((current) => current + 1);
      setNotice(body.message || "这个项目已有绘制任务。已接上该任务。");
      return;
    }
    if (!response.ok || !body.runId) throw new Error(body.message || "绘制没有开始。");
    setRunId(body.runId);
    setWatch((current) => current + 1);
    setNotice("绘制已交给后台。可以留在这一页看进度。");
  }

  async function download(slotId: string, format: "png" | "svg", filename: string) {
    const response = await fetch(`/api/projects/${params.id}/slots/${slotId}/asset?format=${format}`);
    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      throw new Error(body.message || "没有这个文件。");
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function exportPptx() {
    const response = await fetch(`/api/projects/${params.id}/export`, { method: "POST" });
    if (!response.ok) throw new Error(((await response.json()) as { message?: string }).message || "导出失败。");
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${view?.project.title ?? "文稿"}.pptx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const running = job ? ACTIVE.has(job.status) : false;

  if (!view && !error) return <Frame step="illustrate"><p role="status">正在读取配图…</p></Frame>;
  if (!view) return <Frame step="illustrate"><p className="alert" role="alert">{error}</p></Frame>;

  return (
    <Frame mode={view.mode} step="illustrate" projectId={params.id}>
      <section className="sheet">
        <h1>生成配图并导出。</h1>
        <p className="lede">PNG 是位图。SVG 是矢量图，幻灯片里只放它的预览。PowerPoint 可编辑会写成形状、连接线或带工作簿的图表。模型插图不能选后两种。绘制任务在后台进行，刷新后仍可查询。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="ok" role="status">{notice}</p> : null}
        {view.slots.map((slot) => (
          <article className="section-card" key={slot.id}>
            <label className="choice">
              <input type="checkbox" aria-label={`选择 ${slot.title}`} checked={selected.includes(slot.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, slot.id] : current.filter((id) => id !== slot.id))} />
              {slot.title} · {slot.sourceKind || slot.outputType} · {slot.outputMode || "native"} · {slot.status === "succeeded" ? "已完成" : slot.status === "failed" ? "失败" : "未绘制"}
            </label>
            {slot.error ? <p className="alert">{slot.error}</p> : null}
            {slot.resultKind === "raster" ? <p>位图，内部像素不可逐项编辑</p> : null}
            {slot.resultKind === "vector" ? <p>SVG 矢量图，不是 PowerPoint 形状</p> : null}
            {slot.resultKind === "native" ? <p>原生可编辑</p> : null}
            <div className="row">
              {slot.imageBase64 ? <button className="ghost" type="button" onClick={() => void download(slot.id, "png", `${slot.title}.png`).catch((reason: Error) => setError(reason.message))}>下载 PNG</button> : null}
              {slot.svg ? <button className="ghost" type="button" onClick={() => void download(slot.id, "svg", `${slot.title}.svg`).catch((reason: Error) => setError(reason.message))}>下载 SVG</button> : null}
            </div>
          </article>
        ))}
        <div className="row">
          <button className="seal" type="button" disabled={running} onClick={() => void generate(selected).catch((reason: Error) => setError(reason.message))}>绘制所选</button>
          <button className="ghost" type="button" disabled={running} onClick={() => void generate(view.slots.map((slot) => slot.id)).catch((reason: Error) => setError(reason.message))}>绘制全部</button>
          <button className="ghost" type="button" disabled={!runId || running} onClick={() => void fetch(`/api/projects/${params.id}/generate/${runId}/retry`, { method: "POST" }).then(async (response) => {
            if (!response.ok) throw new Error(((await response.json()) as { message?: string }).message || "没有可以重试的项。");
            setWatch((current) => current + 1);
          }).catch((reason: Error) => setError(reason.message))}>重试未完成项</button>
          <button className="quiet" type="button" disabled={!runId || !running} onClick={() => void fetch(`/api/projects/${params.id}/generate/${runId}/cancel`, { method: "POST" })}>取消绘制</button>
          <button className="seal" type="button" onClick={() => void exportPptx().catch((reason: Error) => setError(reason.message))}>导出 PPTX</button>
        </div>
      </section>
    </Frame>
  );
}

function describeJob(job: JobState): string {
  const done = job.items.filter((item) => item.status === "succeeded" || item.status === "skipped").length;
  const active = job.items.filter((item) => item.status === "leased").length;
  const pending = job.items.filter((item) => item.status === "pending").length;
  const failed = job.items.filter((item) => item.status === "failed").length;
  const skipped = job.items.filter((item) => item.status === "skipped").length;
  if (ACTIVE.has(job.status)) return `绘制中：已完成 ${done}，进行中 ${active}，等待 ${pending}。`;
  if (job.status === "cancelled") return "已取消。已完成的占位会保留。";
  if (job.status === "interrupted") return "绘制被中断。已完成的占位会保留，未完成项不会自动重试。";
  if (skipped > 0 && failed === 0) return "已跳过已完成的占位。";
  if (failed > 0) return `绘制结束。成功 ${done}，失败 ${failed}。`;
  return "绘制结束。";
}

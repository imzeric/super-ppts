"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type ProjectView } from "@/lib/model";

export default function IllustratePage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [runId, setRunId] = useState("");

  function load() {
    return fetch(`/api/projects/${params.id}`).then((response) => readJson<ProjectView>(response)).then(setView);
  }

  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  async function generate(slotIds: string[]) {
    const body = await readJson<{ runId: string; results: Array<{ status: string }>; project: ProjectView }>(
      await fetch(`/api/projects/${params.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotIds }),
      }),
    );
    setRunId(body.runId);
    setView(body.project);
    setNotice(body.results.some((item) => item.status === "skipped") ? "已跳过已完成的占位。" : "绘制结束。");
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

  if (!view && !error) return <Frame step="illustrate"><p role="status">正在读取配图…</p></Frame>;
  if (!view) return <Frame step="illustrate"><p className="alert" role="alert">{error}</p></Frame>;

  return (
    <Frame mode={view.mode} step="illustrate" projectId={params.id}>
      <section className="sheet">
        <h1>生成配图并导出。</h1>
        <p className="lede">PNG 是位图。SVG 是矢量图，幻灯片里只放它的预览。PowerPoint 可编辑会写成形状、连接线或带工作簿的图表。模型插图不能选后两种。</p>
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
          <button className="seal" type="button" onClick={() => void generate(selected).catch((reason: Error) => setError(reason.message))}>绘制所选</button>
          <button className="ghost" type="button" onClick={() => void generate(view.slots.map((slot) => slot.id)).catch((reason: Error) => setError(reason.message))}>绘制全部</button>
          <button className="ghost" type="button" onClick={() => void generate(view.slots.filter((slot) => slot.status === "failed").map((slot) => slot.id)).catch((reason: Error) => setError(reason.message))}>重试失败项</button>
          <button className="quiet" type="button" disabled={!runId} onClick={() => void fetch(`/api/projects/${params.id}/generate/${runId}/cancel`, { method: "POST" })}>取消绘制</button>
          <button className="seal" type="button" onClick={() => void exportPptx().catch((reason: Error) => setError(reason.message))}>导出 PPTX</button>
        </div>
      </section>
    </Frame>
  );
}

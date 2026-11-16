"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type ProjectView } from "@/lib/model";

export default function DrawPage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [runId, setRunId] = useState("");

  function load() {
    return fetch(`/api/projects/${params.id}`)
      .then((response) => readJson<ProjectView>(response))
      .then((next) => setView(next));
  }

  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  async function generate(slotIds: string[], force = false) {
    setError("");
    const response = await fetch(`/api/projects/${params.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotIds, force }),
    });
    const body = await readJson<{ runId: string; results: Array<{ status: string }>; project: ProjectView }>(response);
    setRunId(body.runId);
    setView(body.project);
    const skipped = body.results.filter((item) => item.status === "skipped").length;
    setNotice(skipped > 0 ? "已跳过已完成的占位。" : "绘制结束。");
  }

  async function download() {
    const response = await fetch(`/api/projects/${params.id}/export`, { method: "POST" });
    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      throw new Error(body.message || "导出失败。");
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${view?.project.title ?? "文稿"}.pptx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (!view && !error) return <Frame step="draw"><p role="status">正在读取绘制队列…</p></Frame>;
  if (!view) return <Frame step="draw"><p className="alert" role="alert">{error}</p></Frame>;

  return (
    <Frame mode={view.mode} step="draw" projectId={params.id}>
      <section className="sheet">
        <p className="kicker">第四步</p>
        <h1>按占位批量绘制。</h1>
        <p className="lede">流程图、组织图、架构图和关系图会变成可编辑形状与连接线。柱状、折线、饼图和表格也是原生对象。插图是位图，内部像素不可逐项编辑。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="ok" role="status">{notice}</p> : null}
        {view.slots.map((slot) => (
          <article className="section-card" key={slot.id}>
            <label className="choice">
              <input
                type="checkbox"
                aria-label={`选择 ${slot.title}`}
                checked={selected.includes(slot.id)}
                onChange={(event) => setSelected((current) => (event.target.checked ? [...current, slot.id] : current.filter((id) => id !== slot.id)))}
              />
              {slot.title} · {slot.outputType} · {slot.stale ? "待核对" : slot.status === "empty" ? "未绘制" : slot.status === "succeeded" ? "已完成" : "失败"}
            </label>
            {slot.error ? <p className="alert">{slot.error}</p> : null}
            {slot.resultKind === "raster" ? <p>位图，内部像素不可逐项编辑</p> : null}
            {slot.resultKind === "native" ? <p>原生可编辑</p> : null}
            {slot.diagramId ? <Link href={`/diagrams/${slot.diagramId}?project=${params.id}`}>编辑这张图</Link> : null}
          </article>
        ))}
        <div className="row">
          <button className="seal" type="button" onClick={() => void generate(selected).catch((reason: Error) => setError(reason.message))}>绘制所选</button>
          <button
            className="ghost"
            type="button"
            onClick={() => void generate(view.slots.filter((slot) => slot.status === "failed").map((slot) => slot.id)).catch((reason: Error) => setError(reason.message))}
          >
            重试失败项
          </button>
          <button className="quiet" type="button" disabled={!runId} onClick={() => void fetch(`/api/projects/${params.id}/generate/${runId}/cancel`, { method: "POST" })}>
            取消绘制
          </button>
          <button className="ghost" type="button" onClick={() => void download().catch((reason: Error) => setError(reason.message))}>导出 PPTX</button>
        </div>
      </section>
    </Frame>
  );
}

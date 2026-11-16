"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type ProjectView } from "@/lib/model";

export default function OutlinePage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [instruction, setInstruction] = useState("把标题收紧，保留事实、数字和 id 注释。");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const next = await readJson<ProjectView>(await fetch(`/api/projects/${params.id}`));
    setView(next);
    setMarkdown(next.outline.markdown);
  }

  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  async function send(url: string, body?: unknown) {
    setError("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const next = await readJson<ProjectView>(response);
    setView(next);
    setMarkdown(next.outline.markdown);
    return next;
  }

  if (!view && !error) return <Frame step="outline"><p role="status">正在读取大纲…</p></Frame>;
  if (!view) return <Frame step="outline"><p className="alert" role="alert">{error}</p></Frame>;
  const stale = Boolean(view.copy?.stale || view.slots.some((slot) => slot.stale));

  return (
    <Frame mode={view.mode} step="outline" projectId={params.id}>
      <section className="sheet">
        <h1>{view.outline.title || "大纲"}</h1>
        <p className="lede">{view.outline.status === "confirmed" ? "大纲已确认。" : "草稿。"} Markdown 可以改、可以预览。超过 40 张会提示，原文仍会保存。语法问题标出行号，确认前必须先修好。说明共 {view.project.background.length} 字，未截断。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="ok" role="status">{notice}</p> : null}
        {stale ? (
          <div className="alert">
            <p>下游已标为待核对，手工占位仍保留。</p>
            <button className="ghost" type="button" onClick={() => void send(`/api/projects/${params.id}/acknowledge`).then(() => setNotice("已保留现有文字和占位。"))}>
              保留现有文字和占位
            </button>
          </div>
        ) : null}
        {view.candidate ? (
          <div className="alert">
            <p>优化候选还没采用。</p>
            <pre>{view.candidate.markdown}</pre>
            <div className="row">
              <button className="seal" type="button" onClick={() => void send(`/api/projects/${params.id}/outline/accept`).then(() => setNotice("已采用优化。"))}>采用优化</button>
              <button className="ghost" type="button" onClick={() => void send(`/api/projects/${params.id}/outline/discard`).then(() => setNotice("已放弃这次优化。"))}>放弃优化</button>
            </div>
          </div>
        ) : null}
        <label>
          大纲 Markdown
          <textarea aria-label="大纲 Markdown" value={markdown} onChange={(event) => setMarkdown(event.target.value)} style={{ minHeight: 280 }} />
        </label>
        <div className="section-list">
          {view.outline.issues.map((issue) => (
            <p key={`${issue.line}-${issue.message}`} className="alert" role="alert">第 {issue.line} 行：{issue.message}</p>
          ))}
          {view.outline.sections.map((section) => (
            <p key={section.id} className="meta">{section.kind} · {section.title}</p>
          ))}
        </div>
        <label>
          优化说明
          <textarea aria-label="优化说明" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
        </label>
        <div className="row">
          <button
            className="ghost"
            type="button"
            onClick={() =>
              void fetch(`/api/projects/${params.id}/outline`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ markdown }),
              })
                .then((response) => readJson<ProjectView>(response))
                .then((next) => {
                  setView(next);
                  setNotice("已保存");
                })
                .catch((reason: Error) => setError(reason.message))
            }
          >
            保存大纲
          </button>
          <button className="ghost" type="button" onClick={() => void send(`/api/projects/${params.id}/outline/optimize`, { instruction }).catch((reason: Error) => setError(reason.message))}>
            优化整份大纲
          </button>
          <button className="seal" type="button" disabled={view.outline.issues.length > 0 || Boolean(view.candidate)} onClick={() => void send(`/api/projects/${params.id}/outline/confirm`).then(() => setNotice("大纲已确认。")).catch((reason: Error) => setError(reason.message))}>
            确认大纲
          </button>
        </div>
      </section>
    </Frame>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type ProjectView, type SlideCopy } from "@/lib/model";

export default function CopyPage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [slides, setSlides] = useState<SlideCopy[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void fetch(`/api/projects/${params.id}`)
      .then((response) => readJson<ProjectView>(response))
      .then((next) => {
        setView(next);
        setSlides(next.copy?.slides ?? []);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  if (!view && !error) return <Frame step="content"><p role="status">正在读取文字稿…</p></Frame>;
  if (!view) return <Frame step="content"><p className="alert" role="alert">{error}</p></Frame>;

  return (
    <Frame mode={view.mode} step="content" projectId={params.id}>
      <section className="sheet">
        <h1>生成每页文字。</h1>
        <p className="lede">{view.copy?.status === "confirmed" ? "文字已确认。" : "文字未确认。"} 这一步只写标题和正文。模型失败会停在这里，不会假装成功。重新生成不移动占位。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="ok" role="status">{notice}</p> : null}
        {view.copy?.stale ? <p className="alert">大纲变了，这份文字待核对。占位框还在。</p> : null}
        <div className="row">
          <button
            className="ghost"
            type="button"
            onClick={() =>
              void fetch(`/api/projects/${params.id}/copy`, { method: "POST" })
                .then((response) => readJson<ProjectView>(response))
                .then((next) => {
                  setView(next);
                  setSlides(next.copy?.slides ?? []);
                  setNotice("已按大纲生成文字，占位框没有移动。");
                })
                .catch((reason: Error) => setError(reason.message))
            }
          >
            生成幻灯片文字
          </button>
        </div>
        {slides.map((slide, index) => (
          <article className="section-card" key={slide.id}>
            <label>
              第 {index + 1} 页标题
              <input
                aria-label={`第 ${index + 1} 页标题`}
                value={slide.title}
                onChange={(event) => setSlides((current) => current.map((item) => (item.id === slide.id ? { ...item, title: event.target.value } : item)))}
              />
            </label>
            <label>
              第 {index + 1} 页正文
              <textarea
                aria-label={`第 ${index + 1} 页正文`}
                value={slide.lines.join("\n")}
                onChange={(event) =>
                  setSlides((current) => current.map((item) => (item.id === slide.id ? { ...item, lines: event.target.value.split("\n") } : item)))
                }
              />
            </label>
          </article>
        ))}
        <div className="row">
          <button
            className="ghost"
            type="button"
            onClick={() =>
              void fetch(`/api/projects/${params.id}/copy`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slides: slides.map((slide) => ({ ...slide, lines: slide.lines.map((line) => line.trim()).filter(Boolean) })) }),
              })
                .then((response) => readJson<ProjectView>(response))
                .then((next) => {
                  setView(next);
                  setSlides(next.copy?.slides ?? []);
                  setNotice("已保存");
                })
                .catch((reason: Error) => setError(reason.message))
            }
          >
            保存文字
          </button>
          <button
            className="seal"
            type="button"
            onClick={() =>
              void fetch(`/api/projects/${params.id}/copy/confirm`, { method: "POST" })
                .then((response) => readJson<ProjectView>(response))
                .then((next) => {
                  setView(next);
                  setNotice("文字已确认。");
                })
                .catch((reason: Error) => setError(reason.message))
            }
          >
            确认文字
          </button>
        </div>
      </section>
    </Frame>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type DeckSlide, type DiagramModel, type ProjectView } from "@/lib/model";

const SLIDE_W = 12192000;
const SLIDE_H = 6858000;

export default function PreviewPage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [diagrams, setDiagrams] = useState<Record<string, DiagramModel>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${params.id}`);
        const next = await readJson<ProjectView>(response);
        setView(next);
        const ids = next.deck?.slides.filter((slide) => slide.kind === "diagram").map((slide) => slide.diagramId) ?? [];
        const loaded = await Promise.all(
          ids.map(async (id) => {
            const diagramResponse = await fetch(`/api/diagrams/${id}`);
            return [id, await readJson<DiagramModel>(diagramResponse)] as const;
          }),
        );
        setDiagrams(Object.fromEntries(loaded));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "预览读取失败。");
      }
    })();
  }, [params.id]);

  async function download() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${params.id}/export`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message || "导出失败。");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${view?.project.title ?? "文稿"}.pptx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导出失败。");
    } finally {
      setPending(false);
    }
  }

  if (!view && !error) return <Frame step="preview"><p role="status">正在读取预览…</p></Frame>;
  if (!view) return <Frame step="preview"><p className="alert" role="alert">{error}</p></Frame>;

  return (
    <Frame mode={view.mode} step="preview" projectId={params.id}>
      <section className="sheet stage">
        <p className="kicker">第二校</p>
        <h1>屏幕预览，不是 PowerPoint 的像素结果。</h1>
        <p className="lede">这里的框线和连线只帮助看结构。下载后的文件里，文字、表格、形状、连接线和图表都是 PowerPoint 对象。</p>
        {view.deck?.stale || view.outline.status !== "approved" ? (
          <p className="alert">这份预览已过期或大纲尚未批准。请回到大纲重新批准。导出会被拒绝。</p>
        ) : null}
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {!view.deck ? <p>还没有幻灯片。请先在大纲页批准并生成预览。</p> : null}
        {view.deck?.slides.map((slide, index) => (
          <article key={slide.id}>
            <p className="meta">
              第 {index + 1} 张 · {slide.kind}
              {slide.kind === "diagram" ? (
                <>
                  {" "}
                  <Link href={`/diagrams/${slide.diagramId}?project=${params.id}`}>编辑这张图</Link>
                </>
              ) : null}
            </p>
            <SlideFace slide={slide} diagram={slide.kind === "diagram" ? diagrams[slide.diagramId] : undefined} />
          </article>
        ))}
        <div className="row">
          <button className="seal" type="button" onClick={() => void download()} disabled={pending || !view.deck}>
            {pending ? "正在导出…" : "导出 PPTX"}
          </button>
          <Link href={`/projects/${params.id}`}>返回大纲</Link>
        </div>
      </section>
    </Frame>
  );
}

function SlideFace({ slide, diagram }: { slide: DeckSlide; diagram?: DiagramModel }) {
  return (
    <div className="slide">
      {slide.kind === "title" ? (
        <div style={{ marginTop: "18%" }}>
          <h2>{slide.title}</h2>
          {slide.subtitle ? <p>{slide.subtitle}</p> : null}
        </div>
      ) : (
        <h2>{slide.title}</h2>
      )}
      {slide.kind === "bullets" ? (
        <ul>
          {slide.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {slide.kind === "table" ? (
        <table>
          <thead>
            <tr>
              {slide.headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slide.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (
                  <td key={column}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {slide.kind === "chart" ? (
        <div className="chart" aria-hidden="true">
          {slide.chart.categories.map((category, index) => {
            const value = slide.chart.series[0]?.values[index] ?? 0;
            const max = Math.max(...slide.chart.series[0]!.values, 1);
            return (
              <div key={category}>
                <div className="bar" style={{ height: `${Math.max(8, (value / max) * 180)}px` }}>
                  <span>{value}</span>
                </div>
                <div>{category}</div>
              </div>
            );
          })}
        </div>
      ) : null}
      {slide.kind === "diagram" && diagram ? (
        <div style={{ position: "absolute", inset: "18% 4% 8%" }}>
          <svg viewBox={`0 0 ${SLIDE_W} ${SLIDE_H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {diagram.edges.map((edge) => {
              const source = diagram.nodes.find((node) => node.id === edge.source);
              const target = diagram.nodes.find((node) => node.id === edge.target);
              if (!source || !target) return null;
              return (
                <line
                  key={edge.id}
                  x1={source.x + source.w / 2}
                  y1={source.y + source.h / 2}
                  x2={target.x + target.w / 2}
                  y2={target.y + target.h / 2}
                  stroke="#1c1612"
                  strokeWidth={20000}
                />
              );
            })}
          </svg>
          {diagram.nodes.map((node) => (
            <div
              key={node.id}
              className={`node ${node.shape === "ellipse" ? "ellipse" : node.shape === "diamond" ? "diamond" : ""}`}
              style={{
                left: `${(node.x / SLIDE_W) * 100}%`,
                top: `${(node.y / SLIDE_H) * 100}%`,
                width: `${(node.w / SLIDE_W) * 100}%`,
                height: `${(node.h / SLIDE_H) * 100}%`,
              }}
            >
              <span>{node.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { SourcePreview } from "@/components/SourcePreview";
import { readJson, type ProjectView, type SlideCopy } from "@/lib/model";

type SourceKind = "mermaid" | "antv" | "chart" | "image";
type OutputMode = "png" | "svg" | "native";

const MERMAID = "flowchart TD\n  A[到馆登记] --> B(挑选图书)\n  B --> C{办理借出}";
const ANTV = JSON.stringify({ nodes: [{ id: "a", label: "馆长" }, { id: "b", label: "志愿者" }], edges: [{ source: "a", target: "b" }] }, null, 2);

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [slides, setSlides] = useState<SlideCopy[]>([]);
  const [index, setIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [show, setShow] = useState<"stage" | "thumbs" | "inspector">("stage");
  const [sourceKind, setSourceKind] = useState<SourceKind>("mermaid");
  const [outputMode, setOutputMode] = useState<OutputMode>("native");
  const [sourceText, setSourceText] = useState(MERMAID);
  const [title, setTitle] = useState("借阅流程");
  const [xCm, setXCm] = useState(1.5);
  const [yCm, setYCm] = useState(3);
  const [wCm, setWCm] = useState(8);
  const [hCm, setHCm] = useState(4);

  useEffect(() => {
    void fetch(`/api/projects/${params.id}`)
      .then((response) => readJson<ProjectView>(response))
      .then((next) => {
        setView(next);
        setSlides(next.copy?.slides ?? []);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") setIndex((current) => Math.min(slides.length - 1, current + 1));
      if (event.key === "ArrowUp") setIndex((current) => Math.max(0, current - 1));
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", before);
    };
  }, [slides.length, dirty]);

  async function save() {
    const next = await readJson<ProjectView>(
      await fetch(`/api/projects/${params.id}/copy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides }),
      }),
    );
    setView(next);
    setSlides(next.copy?.slides ?? slides);
    setDirty(false);
    setNotice("已保存");
  }

  async function addSlot() {
    const slide = slides[index];
    if (!slide) return;
    const next = await readJson<ProjectView>(
      await fetch(`/api/projects/${params.id}/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideId: slide.id,
          title,
          description: sourceKind === "mermaid" ? "流程图" : title,
          instruction: "按来源绘制",
          outputType: sourceKind === "chart" ? "chart-bar" : sourceKind === "image" ? "illustration" : "diagram-flow",
          sourceKind,
          sourceText,
          outputMode,
          x: Math.round(xCm * 360000),
          y: Math.round(yCm * 360000),
          w: Math.round(wCm * 360000),
          h: Math.round(hCm * 360000),
        }),
      }),
    );
    setView(next);
    setNotice("已添加占位");
  }

  if (!view && !error) return <Frame step="editor"><p role="status">正在打开编辑器…</p></Frame>;
  if (!view) return <Frame step="editor"><p className="alert" role="alert">{error}</p></Frame>;
  const slide = slides[index];
  const ratio = `${view.deck.widthEmu} / ${view.deck.heightEmu}`;
  const slots = view.slots.filter((item) => item.slideId === slide?.id);

  return (
    <Frame mode={view.mode} step="editor" projectId={params.id}>
      <div className="row">
        <button className="rail-toggle ghost" type="button" onClick={() => setShow(show === "thumbs" ? "stage" : "thumbs")}>缩略图</button>
        <button className="rail-toggle ghost" type="button" onClick={() => setShow(show === "inspector" ? "stage" : "inspector")}>属性</button>
        <span role="status">{dirty ? "有未保存的文字" : notice || "已同步"}</span>
        <button className="seal" type="button" onClick={() => void save().catch((reason: Error) => setError(reason.message))}>保存文字</button>
      </div>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <div className="workspace" data-show={show}>
        <aside className="rail" aria-label="幻灯片缩略图">
          {slides.map((item, itemIndex) => (
            <button key={item.id} className="thumb" type="button" aria-current={itemIndex === index} onClick={() => setIndex(itemIndex)}>
              {itemIndex + 1}. {item.title}
            </button>
          ))}
        </aside>
        <section className="stage-slide" style={{ aspectRatio: ratio }} aria-label="当前幻灯片">
          <h2>{slide?.title}</h2>
          <ul>
            {slide?.lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
          {slots.map((slot) => (
            <div key={slot.id} className="node" style={{ left: `${(slot.x / view.deck.widthEmu) * 100}%`, top: `${(slot.y / view.deck.heightEmu) * 100}%`, width: `${(slot.w / view.deck.widthEmu) * 100}%`, height: `${(slot.h / view.deck.heightEmu) * 100}%` }}>
              <span>{slot.title}</span>
            </div>
          ))}
        </section>
        <aside className="inspector">
          <label>
            页面标题
            <input aria-label="编辑页标题" value={slide?.title ?? ""} onChange={(event) => { setSlides((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item)); setDirty(true); }} />
          </label>
          <label>
            页面正文
            <textarea aria-label="编辑页正文" value={slide?.lines.join("\n") ?? ""} onChange={(event) => { setSlides((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, lines: event.target.value.split("\n") } : item)); setDirty(true); }} />
          </label>
          <label>
            占位标题
            <input aria-label="占位标题" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            图来源
            <select aria-label="图来源" value={sourceKind} onChange={(event) => { const next = event.target.value as SourceKind; setSourceKind(next); setSourceText(next === "antv" ? ANTV : next === "chart" ? "一月 10\n二月 16" : next === "image" ? "一张社区书架" : MERMAID); setOutputMode(next === "image" ? "png" : "native"); }}>
              <option value="mermaid">Mermaid 流程图</option>
              <option value="antv">AntV G6 图</option>
              <option value="chart">图表数据</option>
              <option value="image">模型插图</option>
            </select>
          </label>
          <label>
            输出
            <select aria-label="输出形式" value={outputMode} onChange={(event) => setOutputMode(event.target.value as OutputMode)}>
              <option value="native">PowerPoint 可编辑</option>
              <option value="svg">SVG 矢量图</option>
              <option value="png">PNG 位图</option>
            </select>
          </label>
          <label>
            来源或绘图说明
            <textarea aria-label="绘图来源" value={sourceText} onChange={(event) => setSourceText(event.target.value)} />
          </label>
          <label>横坐标厘米<input aria-label="横坐标厘米" value={xCm} onChange={(event) => setXCm(Number(event.target.value))} /></label>
          <label>纵坐标厘米<input aria-label="纵坐标厘米" value={yCm} onChange={(event) => setYCm(Number(event.target.value))} /></label>
          <label>宽度厘米<input aria-label="宽度厘米" value={wCm} onChange={(event) => setWCm(Number(event.target.value))} /></label>
          <label>高度厘米<input aria-label="高度厘米" value={hCm} onChange={(event) => setHCm(Number(event.target.value))} /></label>
          <button className="seal" type="button" onClick={() => void addSlot().catch((reason: Error) => setError(reason.message))}>添加占位</button>
          <SourcePreview kind={sourceKind} source={sourceText} />
          <p>上下方向键切换缩略图。SVG 是矢量图，不是逐个形状。PNG 是位图。只有「PowerPoint 可编辑」会写成形状或图表。</p>
        </aside>
      </div>
    </Frame>
  );
}

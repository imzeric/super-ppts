"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type OutputType, type ProjectView, type Slot } from "@/lib/model";

const TYPES: Array<{ value: OutputType; label: string }> = [
  { value: "diagram-flow", label: "流程图（原生）" },
  { value: "diagram-org", label: "组织图（原生）" },
  { value: "diagram-architecture", label: "架构图（原生）" },
  { value: "diagram-relation", label: "关系图（原生）" },
  { value: "chart-bar", label: "柱状图（原生）" },
  { value: "chart-line", label: "折线图（原生）" },
  { value: "chart-pie", label: "饼图（原生）" },
  { value: "table", label: "表格（原生）" },
  { value: "illustration", label: "插图（位图，内部不可逐项编辑）" },
];

const emptyDraft = {
  slideId: "",
  title: "借阅流程",
  description: "到馆登记\n挑选图书\n办理借出",
  instruction: "从上到下",
  outputType: "diagram-flow" as OutputType,
  xCm: 1.5,
  yCm: 3.2,
  wCm: 8,
  hCm: 6,
};

export default function CanvasPage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function refresh() {
    return fetch(`/api/projects/${params.id}`)
      .then((response) => readJson<ProjectView>(response))
      .then((next) => {
        setView(next);
        setDraft((current) => ({ ...current, slideId: current.slideId || next.copy?.slides[3]?.id || next.copy?.slides[0]?.id || "" }));
      });
  }

  useEffect(() => {
    void refresh().catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  if (!view && !error) return <Frame step="canvas"><p role="status">正在读取画布…</p></Frame>;
  if (!view) return <Frame step="canvas"><p className="alert" role="alert">{error}</p></Frame>;

  return (
    <Frame mode={view.mode} step="canvas" projectId={params.id}>
      <section className="sheet">
        <p className="kicker">第三步</p>
        <h1>占位框由你摆。</h1>
        <p className="lede">屏幕预览，不是 PowerPoint 的像素结果。添加占位不会自动绘图。导出时，还没绘制的占位是带文字的原生形状。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="ok" role="status">{notice}</p> : null}
        <p className="meta">一页最多 8 个占位，便于逐个核对。</p>
        {(view.copy?.slides ?? []).map((slide) => (
          <article key={slide.id} className="section-card">
            <header><strong>{slide.title}</strong></header>
            <div className="slide">
              <h2>{slide.title}</h2>
              {view.slots.filter((slot) => slot.slideId === slide.id).map((slot) => (
                <div key={slot.id} className="node" style={boxStyle(slot)}>
                  <span>{slot.title}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
        <div className="grid-2">
          <label>
            放在哪一页
            <select aria-label="占位所在页" value={draft.slideId} onChange={(event) => setDraft({ ...draft, slideId: event.target.value })}>
              {(view.copy?.slides ?? []).map((slide, index) => (
                <option key={slide.id} value={slide.id}>第 {index + 1} 页 {slide.title}</option>
              ))}
            </select>
          </label>
          <label>
            输出类型
            <select aria-label="输出类型" value={draft.outputType} onChange={(event) => setDraft({ ...draft, outputType: event.target.value as OutputType })}>
              {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label>占位标题<input aria-label="占位标题" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label>画面描述<textarea aria-label="画面描述" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label>绘图说明<textarea aria-label="绘图说明" value={draft.instruction} onChange={(event) => setDraft({ ...draft, instruction: event.target.value })} /></label>
          <label>横坐标厘米<input aria-label="横坐标厘米" value={draft.xCm} onChange={(event) => setDraft({ ...draft, xCm: Number(event.target.value) })} /></label>
          <label>纵坐标厘米<input aria-label="纵坐标厘米" value={draft.yCm} onChange={(event) => setDraft({ ...draft, yCm: Number(event.target.value) })} /></label>
          <label>宽度厘米<input aria-label="宽度厘米" value={draft.wCm} onChange={(event) => setDraft({ ...draft, wCm: Number(event.target.value) })} /></label>
          <label>高度厘米<input aria-label="高度厘米" value={draft.hCm} onChange={(event) => setDraft({ ...draft, hCm: Number(event.target.value) })} /></label>
        </div>
        <button
          className="seal"
          type="button"
          onClick={() =>
            void fetch(`/api/projects/${params.id}/slots`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                slideId: draft.slideId,
                title: draft.title,
                description: draft.description,
                instruction: draft.instruction,
                outputType: draft.outputType,
                x: Math.round(draft.xCm * 360000),
                y: Math.round(draft.yCm * 360000),
                w: Math.round(draft.wCm * 360000),
                h: Math.round(draft.hCm * 360000),
              }),
            })
              .then((response) => readJson<ProjectView>(response))
              .then((next) => {
                setView(next);
                setNotice("已保存占位");
              })
              .catch((reason: Error) => setError(reason.message))
          }
        >
          保存占位
        </button>
      </section>
    </Frame>
  );
}

function boxStyle(slot: Slot) {
  return {
    left: `${(slot.x / 12192000) * 100}%`,
    top: `${(slot.y / 6858000) * 100}%`,
    width: `${(slot.w / 12192000) * 100}%`,
    height: `${(slot.h / 6858000) * 100}%`,
  };
}

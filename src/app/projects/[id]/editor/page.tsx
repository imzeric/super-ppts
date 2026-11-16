"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { SourcePreview } from "@/components/SourcePreview";
import { clientDeltaToEmu, resizeFrame, type Handle } from "@/editor/geometry";
import { plainText } from "@/editor/text";
import { readJson, type ProjectView, type SlideCopy, type Slot } from "@/lib/model";

type SourceKind = "mermaid" | "antv" | "chart" | "image";
type OutputMode = "png" | "svg" | "native";
type Snapshot = { slides: SlideCopy[]; slots: Slot[] };

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MERMAID = "flowchart TD\n  A[到馆登记] --> B(挑选图书)";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [slides, setSlides] = useState<SlideCopy[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("已同步");
  const [error, setError] = useState("");
  const [show, setShow] = useState<"stage" | "thumbs" | "inspector">("stage");
  const [sourceKind, setSourceKind] = useState<SourceKind>("mermaid");
  const [outputMode, setOutputMode] = useState<OutputMode>("native");
  const [sourceText, setSourceText] = useState(MERMAID);
  const [slotTitle, setSlotTitle] = useState("借阅流程");
  const history = useRef<Snapshot[]>([]);
  const canvasRef = useRef<HTMLElement>(null);
  const live = useRef({ slides, slots });
  live.current = { slides, slots };

  useEffect(() => {
    void fetch(`/api/projects/${params.id}`)
      .then((response) => readJson<ProjectView>(response))
      .then((next) => {
        setView(next);
        setSlides(next.copy?.slides ?? []);
        setSlots(next.slots);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  async function persist(nextSlides = live.current.slides, nextSlots = live.current.slots) {
    setStatus("正在保存…");
    const next = await readJson<ProjectView>(
      await fetch(`/api/projects/${params.id}/workspace`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides: nextSlides, slots: nextSlots }),
      }),
    );
    setView(next);
    setSlides(next.copy?.slides ?? nextSlides);
    setSlots(next.slots);
    setStatus("已保存");
    return next;
  }

  function remember() {
    history.current = [...history.current, { slides: structuredClone(live.current.slides), slots: structuredClone(live.current.slots) }].slice(-20);
  }

  function applyText(slideId: string, patch: Partial<SlideCopy>) {
    setSlides((current) => current.map((slide) => (slide.id === slideId ? { ...slide, ...patch } : slide)));
    setStatus("有未保存的文字");
  }

  function mutateSlots(recipe: (current: Slot[]) => Slot[]) {
    remember();
    const next = recipe(live.current.slots);
    setSlots(next);
    void persist(live.current.slides, next).catch((reason: Error) => setError(reason.message));
  }

  function mutateSlides(recipe: (current: SlideCopy[]) => SlideCopy[]) {
    remember();
    const next = recipe(live.current.slides);
    setSlides(next);
    void persist(next, live.current.slots).catch((reason: Error) => setError(reason.message));
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persist().catch((reason: Error) => setError(reason.message));
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const previous = history.current.pop();
        if (!previous) return;
        setSlides(previous.slides);
        setSlots(previous.slots);
        void persist(previous.slides, previous.slots).catch((reason: Error) => setError(reason.message));
      }
      if (typing) return;
      if (event.key === "ArrowDown") setIndex((current) => Math.min(live.current.slides.length - 1, current + 1));
      if (event.key === "ArrowUp") setIndex((current) => Math.max(0, current - 1));
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        mutateSlots((current) => current.map((slot) => (slot.id === selectedId ? { ...slot, detached: true } : slot)));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [params.id, selectedId]);

  function startGesture(event: React.PointerEvent, slot: Slot, handle: Handle) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(slot.id);
    const bounds = canvasRef.current?.getBoundingClientRect();
    const deck = view?.deck;
    if (!bounds || !deck) return;
    const origin = { x: event.clientX, y: event.clientY, frame: { x: slot.x, y: slot.y, w: slot.w, h: slot.h } };
    const move = (ev: PointerEvent) => {
      const dx = clientDeltaToEmu(ev.clientX - origin.x, bounds.width, deck.widthEmu);
      const dy = clientDeltaToEmu(ev.clientY - origin.y, bounds.height, deck.heightEmu);
      const frame = resizeFrame(origin.frame, handle, dx, dy, deck.widthEmu, deck.heightEmu);
      setSlots((current) => current.map((item) => (item.id === slot.id ? { ...item, ...frame } : item)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      void persist().catch((reason: Error) => setError(reason.message));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  async function addSlot() {
    const slide = live.current.slides[index];
    const deck = view?.deck;
    if (!slide || !deck) return;
    remember();
    const slot: Slot = {
      id: crypto.randomUUID(),
      slideId: slide.id,
      title: slotTitle,
      description: sourceKind,
      instruction: "按来源绘制",
      outputType: sourceKind === "chart" ? "chart-bar" : sourceKind === "image" ? "illustration" : "diagram-flow",
      sourceKind,
      sourceText,
      outputMode,
      x: Math.round(1.5 * 360000),
      y: Math.round(3 * 360000),
      w: Math.round(8 * 360000),
      h: Math.round(4 * 360000),
      status: "empty",
      stale: false,
    };
    const next = [...live.current.slots, slot];
    setSlots(next);
    setSelectedId(slot.id);
    await persist(live.current.slides, next);
    setStatus("已添加占位");
  }

  function addSlide() {
    mutateSlides((current) => [...current, { id: crypto.randomUUID(), title: "新的一页", lines: ["写下一句"] }]);
    setIndex(live.current.slides.length);
  }

  function duplicateSlide() {
    const source = live.current.slides[index];
    if (!source) return;
    const id = crypto.randomUUID();
    const clones = live.current.slots
      .filter((slot) => slot.slideId === source.id && !slot.detached)
      .map((slot) => ({ ...slot, id: crypto.randomUUID(), slideId: id, x: slot.x + 120000 }));
    remember();
    const nextSlides = [...live.current.slides.slice(0, index + 1), { ...source, id, title: `${source.title} 副本` }, ...live.current.slides.slice(index + 1)];
    const nextSlots = [...live.current.slots, ...clones];
    setSlides(nextSlides);
    setSlots(nextSlots);
    setIndex(index + 1);
    void persist(nextSlides, nextSlots).catch((reason: Error) => setError(reason.message));
  }

  function deleteSlide() {
    if (live.current.slides.length <= 1) {
      setError("至少保留一页。");
      return;
    }
    const removed = live.current.slides[index];
    remember();
    const nextSlides = live.current.slides.filter((slide) => slide.id !== removed?.id);
    const nextSlots = live.current.slots.map((slot) => (slot.slideId === removed?.id ? { ...slot, detached: true } : slot));
    setSlides(nextSlides);
    setSlots(nextSlots);
    setIndex(Math.max(0, index - 1));
    void persist(nextSlides, nextSlots).catch((reason: Error) => setError(reason.message));
  }

  function moveSlide(direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= live.current.slides.length) return;
    remember();
    const next = live.current.slides.slice();
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(nextIndex, 0, item);
    setSlides(next);
    setIndex(nextIndex);
    void persist(next, live.current.slots).catch((reason: Error) => setError(reason.message));
  }

  if (!view && !error) return <Frame step="editor"><p role="status">正在打开编辑器…</p></Frame>;
  if (!view) return <Frame step="editor"><p className="alert" role="alert">{error}</p></Frame>;
  const slide = slides[index];
  const pageSlots = slots.filter((slot) => slot.slideId === slide?.id && !slot.detached);
  const selected = pageSlots.find((slot) => slot.id === selectedId) ?? null;

  return (
    <Frame mode={view.mode} step="editor" projectId={params.id}>
      <div className="toolbar" role="toolbar" aria-label="编辑工具">
        <button className="rail-toggle ghost" type="button" onClick={() => setShow(show === "thumbs" ? "stage" : "thumbs")}>缩略图</button>
        <button className="rail-toggle ghost" type="button" onClick={() => setShow(show === "inspector" ? "stage" : "inspector")}>属性</button>
        <button className="ghost" type="button" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))}>缩小</button>
        <button className="ghost" type="button" onClick={() => setZoom(1)}>适合宽度</button>
        <button className="ghost" type="button" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))}>放大</button>
        <button className="ghost" type="button" onClick={() => { const previous = history.current.pop(); if (!previous) return; setSlides(previous.slides); setSlots(previous.slots); void persist(previous.slides, previous.slots); }}>撤销</button>
        <button className="ghost" type="button" onClick={addSlide}>新增页面</button>
        <button className="ghost" type="button" onClick={duplicateSlide}>复制页面</button>
        <button className="ghost" type="button" onClick={() => moveSlide(-1)}>上移</button>
        <button className="ghost" type="button" onClick={() => moveSlide(1)}>下移</button>
        <button className="ghost" type="button" onClick={deleteSlide}>删除页面</button>
        <button className="ghost" type="button" onClick={() => void fetch(`/api/projects/${params.id}/deck`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: view.deck.templateId === "night" ? "none" : "night", keepConfirmed: true }) }).then((response) => readJson<ProjectView>(response)).then(setView)}>切换主题</button>
        <span role="status">{status}</span>
      </div>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <div className="workspace" data-show={show}>
        <aside className="rail" aria-label="幻灯片缩略图">
          {slides.map((item, itemIndex) => (
            <button key={item.id} className="thumb" type="button" aria-current={itemIndex === index} onClick={() => { setIndex(itemIndex); setSelectedId(null); }}>
              {itemIndex + 1}. {item.title}
            </button>
          ))}
        </aside>
        <div className="stage-scroll">
          <section
            ref={canvasRef}
            className="stage-slide"
            style={{ aspectRatio: `${view.deck.widthEmu} / ${view.deck.heightEmu}`, width: `${zoom * 100}%` }}
            aria-label="当前幻灯片"
            onPointerDown={() => setSelectedId(null)}
          >
            {slide ? (
              <>
                <h2
                  key={`${slide.id}-title`}
                  role="textbox"
                  aria-label="画布标题"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(event) => applyText(slide.id, { title: plainText(event.currentTarget.textContent ?? "") || "未命名" })}
                >
                  {slide.title}
                </h2>
                <pre
                  key={`${slide.id}-body`}
                  role="textbox"
                  aria-label="画布正文"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(event) => applyText(slide.id, { lines: plainText(event.currentTarget.innerText ?? "").split("\n").filter(Boolean) })}
                >
                  {slide.lines.join("\n")}
                </pre>
              </>
            ) : null}
            {pageSlots.map((slot) => (
              <div
                key={slot.id}
                className={slot.id === selectedId ? "node selected" : "node"}
                data-slot={slot.id}
                style={{ left: `${(slot.x / view.deck.widthEmu) * 100}%`, top: `${(slot.y / view.deck.heightEmu) * 100}%`, width: `${(slot.w / view.deck.widthEmu) * 100}%`, height: `${(slot.h / view.deck.heightEmu) * 100}%` }}
                onPointerDown={(event) => startGesture(event, slot, "move")}
              >
                <span>{slot.title}</span>
                {slot.id === selectedId
                  ? HANDLES.map((handle) => (
                      <i key={handle} className={`handle handle-${handle}`} onPointerDown={(event) => startGesture(event, slot, handle)} />
                    ))
                  : null}
              </div>
            ))}
          </section>
        </div>
        <aside className="inspector">
          {selected ? (
            <>
              <p>当前占位</p>
              <label>占位标题<input aria-label="占位标题" value={selected.title} onChange={(event) => setSlots((current) => current.map((slot) => slot.id === selected.id ? { ...slot, title: event.target.value } : slot))} onBlur={() => void persist()} /></label>
              <p>{selected.outputMode === "png" ? "将导出为位图。" : selected.outputMode === "svg" ? "将导出为 SVG 矢量图，不是逐个形状。" : "将导出为 PowerPoint 可编辑对象。"}</p>
            </>
          ) : (
            <p>未选中占位。点选画布上的框，或在下面新增。</p>
          )}
          <label>
            图来源
            <select aria-label="图来源" value={sourceKind} onChange={(event) => { const next = event.target.value as SourceKind; setSourceKind(next); setSourceText(next === "antv" ? '{"nodes":[{"id":"a","label":"馆长"},{"id":"b","label":"志愿者"}],"edges":[{"source":"a","target":"b"}]}' : next === "chart" ? "一月 10\n二月 16" : next === "image" ? "一张社区书架" : MERMAID); setOutputMode(next === "image" ? "png" : "native"); }}>
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
          <label>占位标题<input aria-label="新占位标题" value={slotTitle} onChange={(event) => setSlotTitle(event.target.value)} /></label>
          <label>来源或绘图说明<textarea aria-label="绘图来源" value={sourceText} onChange={(event) => setSourceText(event.target.value)} /></label>
          <button className="seal" type="button" onClick={() => void addSlot().catch((reason: Error) => setError(reason.message))}>添加占位</button>
          <SourcePreview kind={sourceKind} source={sourceText} />
        </aside>
      </div>
    </Frame>
  );
}

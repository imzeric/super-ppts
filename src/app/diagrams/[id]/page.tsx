"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type DiagramModel, type DiagramNode } from "@/lib/model";

const SLIDE_W = 12192000;
const SLIDE_H = 6858000;

export default function DiagramRoute() {
  return (
    <Suspense fallback={<Frame step="diagram"><p role="status">正在读取图…</p></Frame>}>
      <DiagramPage />
    </Suspense>
  );
}

function DiagramPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const projectId = search.get("project") ?? "";
  const [diagram, setDiagram] = useState<DiagramModel | null>(null);
  const [mode, setMode] = useState<"demo" | "live" | undefined>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    void fetch("/api/mode")
      .then((response) => readJson<{ mode: "demo" | "live" }>(response))
      .then((body) => setMode(body.mode))
      .catch(() => undefined);
    void fetch(`/api/diagrams/${params.id}`)
      .then((response) => readJson<DiagramModel>(response))
      .then((next) => {
        setDiagram(next);
        setSource(next.nodes[0]?.id ?? "");
        setTarget(next.nodes[1]?.id ?? next.nodes[0]?.id ?? "");
      })
      .catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  async function persist(next: DiagramModel, message: string) {
    setError("");
    const response = await fetch(`/api/diagrams/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const saved = await readJson<DiagramModel>(response);
    setDiagram(saved);
    setNotice(message);
  }

  async function relayout(direction: "TB" | "LR") {
    const response = await fetch(`/api/diagrams/${params.id}/layout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    setDiagram(await readJson<DiagramModel>(response));
    setNotice(direction === "TB" ? "已按自上而下重排。" : "已按从左到右重排。");
  }

  async function reseed() {
    const response = await fetch(`/api/diagrams/${params.id}/reseed`, { method: "POST" });
    setDiagram(await readJson<DiagramModel>(response));
    setNotice("已按大纲要点重排。之前的手工位置被替换。");
  }

  function move(nodeId: string, x: number, y: number) {
    setDiagram((current) =>
      current
        ? {
            ...current,
            nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, x: Math.round(x), y: Math.round(y) } : node)),
          }
        : current,
    );
  }

  if (!diagram && !error) return <Frame step="diagram"><p role="status">正在读取图…</p></Frame>;
  if (!diagram) return <Frame step="diagram"><p className="alert" role="alert">{error}</p></Frame>;

  return (
    <Frame mode={mode} step="diagram" projectId={projectId || undefined}>
      <section className="sheet">
        <p className="kicker">图稿</p>
        <h1>同一张图，两处打开。</h1>
        <p className="lede">画布是预览。保存后的节点会变成 PowerPoint 形状，连线会带上两端吸附。屏幕上的线不是最终文件。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="ok" role="status">{notice}</p> : null}
        <div className="editor">
          <div className="canvas-wrap">
            <DiagramCanvas diagram={diagram} onMove={move} />
          </div>
          <aside className="side">
            {diagram.nodes.map((node) => (
              <label key={node.id}>
                节点 {node.id} 标签
                <input
                  aria-label={`节点 ${node.id} 标签`}
                  value={node.label}
                  onChange={(event) =>
                    setDiagram({
                      ...diagram,
                      nodes: diagram.nodes.map((item) => (item.id === node.id ? { ...item, label: event.target.value } : item)),
                    })
                  }
                />
                <select
                  aria-label={`节点 ${node.id} 形状`}
                  value={node.shape}
                  onChange={(event) =>
                    setDiagram({
                      ...diagram,
                      nodes: diagram.nodes.map((item) =>
                        item.id === node.id ? { ...item, shape: event.target.value as DiagramNode["shape"] } : item,
                      ),
                    })
                  }
                >
                  <option value="rect">矩形</option>
                  <option value="roundRect">圆角</option>
                  <option value="ellipse">椭圆</option>
                  <option value="diamond">菱形</option>
                </select>
              </label>
            ))}
            <label>
              新连线起点
              <select aria-label="连线起点" value={source} onChange={(event) => setSource(event.target.value)}>
                {diagram.nodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.label}</option>
                ))}
              </select>
            </label>
            <label>
              新连线终点
              <select aria-label="连线终点" value={target} onChange={(event) => setTarget(event.target.value)}>
                {diagram.nodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.label}</option>
                ))}
              </select>
            </label>
            <div className="row">
              <button
                className="ghost"
                type="button"
                onClick={() =>
                  setDiagram({
                    ...diagram,
                    edges: [
                      ...diagram.edges,
                      {
                        id: `e${diagram.edges.length + 1}-${crypto.randomUUID().slice(0, 4)}`,
                        source,
                        target,
                        routing: "straight",
                        sourceAnchor: "auto",
                        targetAnchor: "auto",
                      },
                    ],
                  })
                }
              >
                添加连线
              </button>
              <button
                className="quiet"
                type="button"
                onClick={() =>
                  setDiagram({
                    ...diagram,
                    nodes: [
                      ...diagram.nodes,
                      {
                        id: `n${diagram.nodes.length + 1}`,
                        label: "新节点",
                        shape: "rect",
                        x: 548640,
                        y: 4200000,
                        w: 2400000,
                        h: 800000,
                      },
                    ],
                  })
                }
              >
                添加节点
              </button>
            </div>
            <div className="row">
              <button className="seal" type="button" onClick={() => void persist(diagram, "已保存这张图").catch((reason: Error) => setError(reason.message))}>
                保存图
              </button>
              <button className="ghost" type="button" onClick={() => void relayout("TB").catch((reason: Error) => setError(reason.message))}>自上而下重排</button>
              <button className="ghost" type="button" onClick={() => void relayout("LR").catch((reason: Error) => setError(reason.message))}>从左到右重排</button>
              <button className="quiet" type="button" onClick={() => void reseed().catch((reason: Error) => setError(reason.message))}>按要点重排</button>
            </div>
            {projectId ? <Link href={`/projects/${projectId}/preview`}>返回预览</Link> : null}
          </aside>
        </div>
      </section>
    </Frame>
  );
}

function DiagramCanvas({ diagram, onMove }: { diagram: DiagramModel; onMove: (id: string, x: number, y: number) => void }) {
  function start(event: ReactPointerEvent<HTMLDivElement>, node: DiagramNode) {
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    const move = (ev: PointerEvent) => {
      const x = ((ev.clientX - bounds.left) / bounds.width) * SLIDE_W - node.w / 2;
      const y = ((ev.clientY - bounds.top) / bounds.height) * SLIDE_H - node.h / 2;
      onMove(node.id, Math.max(0, x), Math.max(0, y));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9" }}>
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
              strokeWidth={28000}
            />
          );
        })}
      </svg>
      {diagram.nodes.map((node) => (
        <div
          key={node.id}
          className={`node ${node.shape === "ellipse" ? "ellipse" : node.shape === "diamond" ? "diamond" : node.shape === "roundRect" ? "round" : ""}`}
          style={{
            left: `${(node.x / SLIDE_W) * 100}%`,
            top: `${(node.y / SLIDE_H) * 100}%`,
            width: `${(node.w / SLIDE_W) * 100}%`,
            height: `${(node.h / SLIDE_H) * 100}%`,
            cursor: "grab",
          }}
          onPointerDown={(event) => start(event, node)}
        >
          <span>{node.label}</span>
        </div>
      ))}
    </div>
  );
}

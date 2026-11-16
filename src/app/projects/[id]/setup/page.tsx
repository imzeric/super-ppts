"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type ProjectView } from "@/lib/model";

const SIZES = [
  { id: "16:9", label: "16:9" },
  { id: "4:3", label: "4:3" },
  { id: "16:10", label: "16:10" },
];

const TEMPLATES = [
  { id: "none", name: "不使用模板", paper: "#f6f1e8", ink: "#1c1916", accent: "#c8452f" },
  { id: "minutes", name: "纪要", paper: "#e7eef2", ink: "#1e2a32", accent: "#2f5d73" },
  { id: "lecture", name: "讲义", paper: "#f3f6ef", ink: "#1d3328", accent: "#3e6b45" },
  { id: "night", name: "夜场", paper: "#1a1916", ink: "#f4efe6", accent: "#e07a5f" },
];

export default function SetupPage() {
  const params = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void fetch(`/api/projects/${params.id}`)
      .then((response) => readJson<ProjectView>(response))
      .then(setView)
      .catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  async function choose(body: { aspect?: string; templateId?: string }) {
    setError("");
    const next = await readJson<ProjectView>(
      await fetch(`/api/projects/${params.id}/deck`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    setView(next);
    setNotice("比例已写入。已有占位按新尺寸等比缩放，没有删除。");
  }

  if (!view && !error) return <Frame step="setup"><p role="status">正在读取属性…</p></Frame>;
  if (!view) return <Frame step="setup"><p className="alert" role="alert">{error}</p></Frame>;

  return (
    <Frame mode={view.mode} step="setup" projectId={params.id}>
      <section className="sheet">
        <h1>定下页面尺寸。</h1>
        <p className="lede">模板可以不选。预览和导出使用同一组宽高。当前 {view.deck.widthEmu} × {view.deck.heightEmu} EMU。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="ok" role="status">{notice}</p> : null}
        <div className="sizes" role="group" aria-label="幻灯片比例">
          {SIZES.map((size) => (
            <button key={size.id} className={view.deck.aspect === size.id ? "seal" : "ghost"} type="button" aria-pressed={view.deck.aspect === size.id} onClick={() => void choose({ aspect: size.id }).catch((reason: Error) => setError(reason.message))}>
              {size.label}
            </button>
          ))}
        </div>
        <div className="templates">
          {TEMPLATES.map((template) => (
            <button key={template.id} className="template" type="button" aria-pressed={view.deck.templateId === template.id} onClick={() => void choose({ templateId: template.id }).catch((reason: Error) => setError(reason.message))}>
              <span className="mini" style={{ background: template.paper, color: template.ink }}>
                <span style={{ width: 28, height: 4, background: template.accent }} />
                <strong>{template.name}</strong>
              </span>
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="seal" type="button" onClick={() => void fetch(`/api/projects/${params.id}/deck`, { method: "POST" }).then((response) => readJson<ProjectView>(response)).then((next) => { setView(next); setNotice("属性已确认。"); }).catch((reason: Error) => setError(reason.message))}>
            {view.deck.confirmed ? "属性已确认" : "确认属性"}
          </button>
        </div>
      </section>
    </Frame>
  );
}

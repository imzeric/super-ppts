"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type OutlineSection, type ProjectView, type SectionKind } from "@/lib/model";

const KIND_LABEL: Record<SectionKind, string> = {
  title: "标题",
  bullets: "要点",
  table: "表格",
  diagram: "流程图",
  chart: "图表",
};

export default function OutlinePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<ProjectView | null>(null);
  const [sections, setSections] = useState<OutlineSection[]>([]);
  const [instruction, setInstruction] = useState("把表述收紧，保留原有事实和数字。");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState("");

  async function load() {
    const response = await fetch(`/api/projects/${params.id}`);
    const next = await readJson<ProjectView>(response);
    setView(next);
    setSections(next.outline.sections);
  }

  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, [params.id]);

  function update(index: number, patch: Partial<OutlineSection>) {
    setSections((current) => current.map((section, item) => (item === index ? { ...section, ...patch } : section)));
    setNotice("");
  }

  async function save() {
    setPending("save");
    setError("");
    try {
      const response = await fetch(`/api/projects/${params.id}/outline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sections.map((section) => ({
            ...section,
            bullets: section.bullets?.map((bullet) => bullet.trim()).filter(Boolean),
          })),
        }),
      });
      const next = await readJson<ProjectView>(response);
      setView(next);
      setSections(next.outline.sections);
      setNotice("已保存");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败。");
    } finally {
      setPending("");
    }
  }

  async function optimize(sectionId?: string) {
    setPending("optimize");
    setError("");
    try {
      const response = await fetch(`/api/projects/${params.id}/outline/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, sectionId }),
      });
      const next = await readJson<ProjectView>(response);
      setView(next);
      setNotice("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "优化失败。");
    } finally {
      setPending("");
    }
  }

  async function decide(path: "accept" | "discard") {
    setPending(path);
    setError("");
    try {
      const response = await fetch(`/api/projects/${params.id}/outline/${path}`, { method: "POST" });
      const next = await readJson<ProjectView>(response);
      setView(next);
      setSections(next.outline.sections);
      setNotice(path === "accept" ? "已采用优化，大纲回到草稿。" : "已放弃这次优化。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败。");
    } finally {
      setPending("");
    }
  }

  async function approve() {
    setPending("approve");
    setError("");
    try {
      const response = await fetch(`/api/projects/${params.id}/deck`, { method: "POST" });
      const next = await readJson<ProjectView>(response);
      setView(next);
      router.push(`/projects/${params.id}/preview`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "还不能生成预览。");
      setPending("");
    }
  }

  if (!view && !error) return <Frame step="outline"><p role="status">正在读取文稿…</p></Frame>;
  if (!view) return <Frame step="outline"><p className="alert" role="alert">{error}</p></Frame>;

  return (
    <Frame mode={view.mode} step="outline" projectId={params.id}>
      <section className="sheet">
        <p className="kicker">{view.outline.status === "approved" ? "已批准" : "草稿"} · 第 {view.outline.versionNo} 稿</p>
        <h1>{view.project.title}</h1>
        <p className="lede">首版一次最多 8 张幻灯片，用来逐张核对原生文字、表格、形状、连接线和图表。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        {notice ? <p className="ok" role="status">{notice}</p> : null}
        {view.candidate ? (
          <div className="alert">
            <p>有一份优化候选，采用后才会替换当前大纲。</p>
            <ul>
              {view.candidate.sections.map((section) => (
                <li key={section.id}>{section.title}</li>
              ))}
            </ul>
            <div className="row">
              <button className="seal" type="button" onClick={() => void decide("accept")} disabled={pending !== ""}>采用优化</button>
              <button className="ghost" type="button" onClick={() => void decide("discard")} disabled={pending !== ""}>放弃优化</button>
            </div>
          </div>
        ) : null}
        <div className="section-list">
          {sections.map((section, index) => (
            <article className="section-card" key={section.id}>
              <header>
                <strong>第 {index + 1} 节 · {KIND_LABEL[section.kind]}</strong>
                <span className="meta">{section.diagramId ? "已关联图" : ""}</span>
              </header>
              <label>
                第 {index + 1} 节标题
                <input aria-label={`第 ${index + 1} 节标题`} value={section.title} onChange={(event) => update(index, { title: event.target.value })} />
              </label>
              {section.kind === "title" ? (
                <label>
                  副标题
                  <input aria-label={`第 ${index + 1} 节副标题`} value={section.subtitle ?? ""} onChange={(event) => update(index, { subtitle: event.target.value })} />
                </label>
              ) : null}
              {section.kind === "bullets" || section.kind === "diagram" ? (
                <label>
                  {section.kind === "diagram" ? "节点要点，每行一个" : "要点，每行一条"}
                  <textarea
                    aria-label={`第 ${index + 1} 节要点`}
                    value={(section.bullets ?? []).join("\n")}
                    onChange={(event) => update(index, { bullets: event.target.value.split("\n") })}
                  />
                </label>
              ) : null}
              {section.kind === "table" && section.table ? (
                <div className="table-edit">
                  <div className="line">
                    {section.table.headers.map((header, column) => (
                      <input
                        key={`h-${column}`}
                        aria-label={`第 ${index + 1} 节表头 ${column + 1}`}
                        value={header}
                        onChange={(event) => {
                          const headers = section.table!.headers.slice();
                          headers[column] = event.target.value;
                          update(index, { table: { ...section.table!, headers } });
                        }}
                      />
                    ))}
                  </div>
                  {section.table.rows.map((row, rowIndex) => (
                    <div className="line" key={`r-${rowIndex}`}>
                      {row.map((cell, column) => (
                        <input
                          key={`c-${column}`}
                          aria-label={`第 ${index + 1} 节单元格 ${rowIndex + 1}-${column + 1}`}
                          value={cell}
                          onChange={(event) => {
                            const rows = section.table!.rows.map((item) => item.slice());
                            rows[rowIndex]![column] = event.target.value;
                            update(index, { table: { ...section.table!, rows } });
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
              {section.kind === "chart" && section.chart ? (
                <div className="grid-2">
                  <label>
                    图表类型
                    <select
                      aria-label={`第 ${index + 1} 节图表类型`}
                      value={section.chart.type}
                      onChange={(event) => update(index, { chart: { ...section.chart!, type: event.target.value as ChartSpecType } })}
                    >
                      <option value="bar">柱状图</option>
                      <option value="line">折线图</option>
                      <option value="pie">饼图</option>
                    </select>
                  </label>
                  <label>
                    类别，用顿号分隔
                    <input
                      aria-label={`第 ${index + 1} 节图表类别`}
                      value={section.chart.categories.join("、")}
                      onChange={(event) => {
                        const categories = event.target.value.split("、").map((item) => item.trim()).filter(Boolean);
                        const values = section.chart!.series[0]?.values ?? [];
                        update(index, {
                          chart: {
                            ...section.chart!,
                            categories,
                            series: section.chart!.series.map((series) => ({
                              ...series,
                              values: categories.map((_, item) => values[item] ?? 0),
                            })),
                          },
                        });
                      }}
                    />
                  </label>
                  <label>
                    系列名称
                    <input
                      aria-label={`第 ${index + 1} 节系列名称`}
                      value={section.chart.series[0]?.name ?? ""}
                      onChange={(event) => {
                        const series = section.chart!.series.slice();
                        series[0] = { ...series[0]!, name: event.target.value };
                        update(index, { chart: { ...section.chart!, series } });
                      }}
                    />
                  </label>
                  <label>
                    数值，用顿号分隔
                    <input
                      aria-label={`第 ${index + 1} 节图表数值`}
                      value={(section.chart.series[0]?.values ?? []).join("、")}
                      onChange={(event) => {
                        const values = event.target.value.split("、").map((item) => Number(item.trim())).map((item) => (Number.isFinite(item) ? item : 0));
                        const series = section.chart!.series.slice();
                        series[0] = { ...series[0]!, values };
                        update(index, { chart: { ...section.chart!, series } });
                      }}
                    />
                  </label>
                </div>
              ) : null}
              <div className="row">
                <button className="quiet" type="button" onClick={() => void optimize(section.id)} disabled={pending !== "" || Boolean(view.candidate)}>优化这一节</button>
                <button
                  className="quiet"
                  type="button"
                  disabled={sections.length <= 1}
                  onClick={() => setSections((current) => current.filter((_, item) => item !== index))}
                >
                  删除这一节
                </button>
              </div>
            </article>
          ))}
        </div>
        <div className="composer">
          <label>
            优化说明
            <textarea aria-label="优化说明" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
          </label>
          <div className="row">
            <button className="ghost" type="button" onClick={() => void save()} disabled={pending !== ""}>保存大纲</button>
            <button className="ghost" type="button" onClick={() => void optimize()} disabled={pending !== "" || Boolean(view.candidate)}>
              {pending === "optimize" ? "正在优化…" : "优化整份大纲"}
            </button>
            <button className="seal" type="button" onClick={() => void approve()} disabled={pending !== "" || Boolean(view.candidate)}>
              {pending === "approve" ? "正在生成预览…" : "批准并生成预览"}
            </button>
            <button
              className="quiet"
              type="button"
              disabled={sections.length >= 8}
              onClick={() =>
                setSections((current) => [
                  ...current,
                  { id: `sec-${crypto.randomUUID()}`, kind: "bullets", title: "新的一节", bullets: ["写下一个要点"] },
                ])
              }
            >
              添加一节
            </button>
          </div>
        </div>
      </section>
    </Frame>
  );
}

type ChartSpecType = "bar" | "line" | "pie";

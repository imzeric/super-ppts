"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson, type ProjectView, type SourceKind } from "@/lib/model";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"demo" | "live" | undefined>();
  const [sourceKind, setSourceKind] = useState<SourceKind>("topic");
  const [sourceText, setSourceText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetch("/api/mode")
      .then((response) => readJson<{ mode: "demo" | "live" }>(response))
      .then((body) => setMode(body.mode))
      .catch((reason: Error) => setError(reason.message));
  }, []);

  async function submit() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKind, sourceText }),
      });
      const view = await readJson<ProjectView>(response);
      router.push(`/projects/${view.project.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "生成失败。");
      setPending(false);
    }
  }

  return (
    <Frame mode={mode} step="start">
      <section className="sheet">
        <p className="kicker">第一校</p>
        <h1>先把话说成大纲。</h1>
        <p className="lede">写下题目，或贴进已有材料。生成之后可以逐节改、收紧表述，批准后才做成 16:9 幻灯片，并导出可继续编辑的 PowerPoint。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="row">
            <label className="choice">
              <input type="radio" name="kind" checked={sourceKind === "topic"} onChange={() => setSourceKind("topic")} />
              主题
            </label>
            <label className="choice">
              <input type="radio" name="kind" checked={sourceKind === "paste"} onChange={() => setSourceKind("paste")} />
              粘贴内容
            </label>
          </div>
          <label>
            主题或材料
            <textarea aria-label="主题或材料" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="例如：社区图书角三个月试点" />
          </label>
          <div className="row">
            <button className="seal" type="submit" disabled={pending}>
              {pending ? "正在生成大纲…" : "生成大纲"}
            </button>
          </div>
        </form>
      </section>
    </Frame>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson } from "@/lib/model";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"demo" | "live" | undefined>();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetch("/api/mode")
      .then((response) => readJson<{ mode: "demo" | "live" }>(response))
      .then((body) => setMode(body.mode))
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <Frame mode={mode} step="start">
      <form
        className="sheet"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          void fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ background: prompt }),
          })
            .then((response) => readJson<{ project: { id: string } }>(response))
            .then((view) => router.push(`/projects/${view.project.id}`))
            .catch((reason: Error) => {
              setError(reason.message);
              setPending(false);
            });
        }}
      >
        <h1>把说明写成大纲。</h1>
        <p className="lede">在这张纸上写下你想让演示稿完成的事。字数不设产品上限；如果模型上下文装不下，会告诉你失败原因，不会悄悄截断已经写下的内容。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        <label>
          生成说明
          <textarea className="prompt" aria-label="生成说明" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="例如：向街道说明社区图书角三个月的借阅、志愿班和需要的支持。" />
        </label>
        <div className="actions">
          <button className="seal" type="submit" disabled={pending}>{pending ? "正在生成大纲…" : "生成大纲"}</button>
        </div>
      </form>
    </Frame>
  );
}

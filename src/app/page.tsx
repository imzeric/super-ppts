"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Frame } from "@/components/Frame";
import { readJson } from "@/lib/model";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"demo" | "live" | undefined>();
  const [background, setBackground] = useState("");
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
      <section className="sheet">
        <p className="kicker">第一步</p>
        <h1>先写下背景。</h1>
        <p className="lede">背景只会生成 Markdown 大纲。确认大纲之后，才单独写每页文字，再由你亲手摆放占位框。</p>
        {error ? <p className="alert" role="alert">{error}</p> : null}
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            setError("");
            void fetch("/api/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ background }),
            })
              .then((response) => readJson<{ project: { id: string } }>(response))
              .then((view) => router.push(`/projects/${view.project.id}`))
              .catch((reason: Error) => {
                setError(reason.message);
                setPending(false);
              });
          }}
        >
          <label>
            背景
            <textarea aria-label="背景" value={background} onChange={(event) => setBackground(event.target.value)} placeholder="例如：社区图书角三个月试点，想向街道说明借阅和志愿服务。" />
          </label>
          <button className="seal" type="submit" disabled={pending}>{pending ? "正在生成大纲…" : "生成大纲"}</button>
        </form>
      </section>
    </Frame>
  );
}

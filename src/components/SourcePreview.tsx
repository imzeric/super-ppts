"use client";

import { useEffect, useRef, useState } from "react";

export function SourcePreview({ kind, source }: { kind: string; source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let graph: { destroy?: () => void; render?: () => Promise<void> } | undefined;
    let cancelled = false;
    host.replaceChildren();
    if (kind === "antv") {
      void import("@antv/g6")
        .then(async ({ Graph }) => {
          if (cancelled || !ref.current) return;
          graph = new Graph({ container: ref.current, autoFit: "view", data: JSON.parse(source) as object }) as { destroy?: () => void; render?: () => Promise<void> };
          await graph.render?.();
        })
        .catch((error: Error) => setNote(error.message));
    }
    if (kind === "mermaid") {
      void import("mermaid")
        .then(async (mod) => {
          if (cancelled || !ref.current) return;
          mod.default.initialize({ startOnLoad: false, securityLevel: "strict" });
          const rendered = await mod.default.render(`preview-${Date.now()}`, source);
          ref.current.innerHTML = rendered.svg;
        })
        .catch((error: Error) => setNote(error.message));
    }
    return () => {
      cancelled = true;
      graph?.destroy?.();
    };
  }, [kind, source]);

  return (
    <div>
      <div ref={ref} className="source-preview" />
      {note ? <p className="alert">{note}</p> : null}
    </div>
  );
}

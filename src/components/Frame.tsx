import Link from "next/link";
import type { ReactNode } from "react";

const steps = [
  { id: "outline", label: "大纲" },
  { id: "preview", label: "预览" },
  { id: "export", label: "导出" },
] as const;

export function Frame({
  mode,
  step,
  projectId,
  children,
}: {
  mode?: "demo" | "live";
  step: "start" | "outline" | "preview" | "diagram";
  projectId?: string;
  children: ReactNode;
}) {
  return (
    <div className="desk">
      <div className="register" aria-hidden="true" />
      <header className="mast">
        <Link href="/" className="mark">
          <span>校对台</span>
          <small>PROOF</small>
        </Link>
        {projectId ? (
          <nav className="steps" aria-label="进度">
            <Link href={`/projects/${projectId}`} aria-current={step === "outline" ? "page" : undefined}>
              1 {steps[0].label}
            </Link>
            <Link href={`/projects/${projectId}/preview`} aria-current={step === "preview" ? "page" : undefined}>
              2 {steps[1].label}
            </Link>
            <span aria-current={step === "preview" ? undefined : undefined}>3 {steps[2].label}</span>
          </nav>
        ) : (
          <p className="mast-note">从一句话到可编辑的 PowerPoint</p>
        )}
      </header>
      {mode === "demo" ? (
        <p className="banner" role="status">
          演示模式。没有配置模型密钥，当前使用内置的社区图书角示例，不会访问网络。
        </p>
      ) : null}
      <main>{children}</main>
    </div>
  );
}

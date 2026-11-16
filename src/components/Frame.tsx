import Link from "next/link";
import type { ReactNode } from "react";

const steps = [
  { id: "outline", href: "", label: "1 大纲" },
  { id: "copy", href: "/copy", label: "2 文字" },
  { id: "canvas", href: "/canvas", label: "3 占位" },
  { id: "draw", href: "/draw", label: "4 绘制" },
] as const;

export function Frame({
  mode,
  step,
  projectId,
  children,
}: {
  mode?: "demo" | "live";
  step: "start" | "outline" | "copy" | "canvas" | "draw" | "diagram" | "settings";
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
            {steps.map((item) => (
              <Link key={item.id} href={`/projects/${projectId}${item.href}`} aria-current={step === item.id ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <p className="mast-note">
            <Link href="/settings">接口设置</Link>
          </p>
        )}
      </header>
      {mode === "demo" ? (
        <p className="banner" role="status">
          演示模式。没有配置文本模型密钥，大纲使用内置示例，不会访问网络。
        </p>
      ) : null}
      <main>{children}</main>
    </div>
  );
}

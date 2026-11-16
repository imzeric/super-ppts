import Link from "next/link";
import type { ReactNode } from "react";

const steps = [
  { id: "outline", href: "", label: "大纲" },
  { id: "setup", href: "/setup", label: "属性" },
  { id: "content", href: "/copy", label: "内容" },
  { id: "editor", href: "/editor", label: "编辑" },
  { id: "illustrate", href: "/illustrate", label: "配图" },
] as const;

export function Frame({
  mode,
  step,
  projectId,
  children,
}: {
  mode?: "demo" | "live";
  step: "start" | "outline" | "setup" | "content" | "editor" | "illustrate" | "diagram" | "settings";
  projectId?: string;
  children: ReactNode;
}) {
  return (
    <div className="desk">
      <header className="mast">
        <Link href="/" className="mark">
          <span>校对台</span>
          <small>LIGHT TABLE</small>
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
          <Link href="/settings">接口设置</Link>
        )}
      </header>
      {mode === "demo" ? <p className="banner" role="status">演示模式。没有文本密钥，不会访问模型。超长说明会原样保存。</p> : null}
      <main>{children}</main>
    </div>
  );
}

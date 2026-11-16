import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("六步：说明、大纲、属性、文字、编辑、配图导出", async ({ page }) => {
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "把说明写成大纲。" })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/home.png", fullPage: true });
  const prompt = `社区图书角三个月试点。${"借阅".repeat(4500)}`;
  expect(prompt.length).toBeGreaterThan(8000);
  await page.getByLabel("生成说明").fill(prompt);
  await page.getByRole("button", { name: "生成大纲" }).click();
  await expect(page.getByText(`说明共 ${prompt.length} 字，未截断。`)).toBeVisible();
  const markdown = page.getByLabel("大纲 Markdown");
  await expect(markdown).toHaveValue(/# 社区图书角三个月试点/);
  const original = await markdown.inputValue();
  await markdown.fill(original.replace("居民借阅与志愿服务", "居民借阅"));
  await page.getByRole("button", { name: "保存大纲" }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("大纲 Markdown")).toHaveValue(/居民借阅/);
  await page.screenshot({ path: "/opt/cursor/artifacts/outline.png", fullPage: true });
  await page.getByRole("button", { name: "优化整份大纲" }).click();
  await expect(page.getByText("社区图书角三个月试点（收紧）")).toBeVisible();
  await page.getByRole("button", { name: "采用优化" }).click();
  await page.getByRole("button", { name: "确认大纲" }).click();

  await page.getByRole("link", { name: "属性" }).click();
  await page.getByRole("button", { name: "4:3" }).click();
  await page.getByRole("button", { name: "讲义" }).click();
  await page.getByRole("button", { name: "确认属性" }).click();
  await expect(page.getByText("属性已确认。")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/templates.png", fullPage: true });

  await page.getByRole("link", { name: "内容" }).click();
  await page.getByRole("button", { name: "生成幻灯片文字" }).click();
  await page.getByLabel("第 1 页标题").fill("社区图书角开场");
  await page.getByRole("button", { name: "保存文字" }).click();
  await page.reload();
  await expect(page.getByLabel("第 1 页标题")).toHaveValue("社区图书角开场");
  await page.getByRole("button", { name: "确认文字" }).click();

  await page.getByRole("link", { name: "编辑" }).click();
  await page.getByRole("button", { name: "添加占位" }).click();
  await expect(page.getByText("已添加占位")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/editor.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.screenshot({ path: "/opt/cursor/artifacts/editor-narrow.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole("link", { name: "配图" }).click();
  await page.getByLabel("选择 借阅流程").check();
  await page.getByRole("button", { name: "绘制所选" }).click();
  await expect(page.getByText("原生可编辑")).toBeVisible();
  await page.getByRole("button", { name: "绘制所选" }).click();
  await expect(page.getByText("已跳过已完成的占位。")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PPTX" }).click();
  await (await download).saveAs("/opt/cursor/artifacts/sample-editable.pptx");
  await page.screenshot({ path: "/opt/cursor/artifacts/illustrate.png", fullPage: true });
});

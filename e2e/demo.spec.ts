import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("演示模式可以从大纲走到可下载的 pptx，并在改稿后拒绝导出", async ({ page }) => {
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  await page.goto("/");
  await expect(page.getByText("演示模式")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/home.png", fullPage: true });

  await page.getByLabel("主题或材料").fill("社区图书角试点");
  await page.getByRole("button", { name: "生成大纲" }).click();
  await expect(page.getByRole("heading", { name: "社区图书角三个月试点" })).toBeVisible();
  await page.getByLabel("第 1 节标题").fill("社区图书角试点汇报");
  await page.getByRole("button", { name: "保存大纲" }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("第 1 节标题")).toHaveValue("社区图书角试点汇报");
  await page.screenshot({ path: "/opt/cursor/artifacts/outline.png", fullPage: true });

  await page.getByRole("button", { name: "优化整份大纲" }).click();
  await expect(page.getByText("社区图书角试点汇报（收紧）")).toBeVisible();
  await page.getByRole("button", { name: "采用优化" }).click();
  await expect(page.getByLabel("第 1 节标题")).toHaveValue("社区图书角试点汇报（收紧）");
  await page.getByRole("button", { name: "批准并生成预览" }).click();
  await expect(page.getByRole("heading", { name: "屏幕预览，不是 PowerPoint 的像素结果。" })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/preview.png", fullPage: true });

  await page.getByRole("link", { name: "编辑这张图" }).click();
  await page.getByLabel("节点 n1 标签").fill("到馆登记");
  await page.getByRole("button", { name: "保存图" }).click();
  await expect(page.getByText("已保存这张图")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("节点 n1 标签")).toHaveValue("到馆登记");
  await page.screenshot({ path: "/opt/cursor/artifacts/diagram.png", fullPage: true });

  await page.getByRole("link", { name: "返回预览" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PPTX" }).click();
  const download = await downloadPromise;
  await download.saveAs("/opt/cursor/artifacts/sample-editable.pptx");

  await page.getByRole("link", { name: "返回大纲" }).click();
  await page.getByLabel("第 1 节标题").fill("批准后又改过");
  await page.getByRole("button", { name: "保存大纲" }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "2 预览" }).click();
  await page.getByRole("button", { name: "导出 PPTX" }).click();
  await expect(page.getByText("大纲还没批准")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/export-blocked.png", fullPage: true });
});

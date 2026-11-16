import { parseOutline } from "./validate";
import type { ChartSpec, DiagramIntent, OutlineSection, SectionKind, TableSpec } from "./types";

export type MarkdownIssue = { line: number; message: string };

export type MarkdownOutline = {
  title: string;
  sections: OutlineSection[];
  issues: MarkdownIssue[];
};

const KINDS = new Set(["title", "bullets", "table", "diagram", "chart"]);
const INTENTS = new Set(["flow", "org", "architecture", "relation"]);
const CHARTS = new Set(["bar", "line", "pie"]);

export function parseMarkdownOutline(source: string): MarkdownOutline {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const issues: MarkdownIssue[] = [];
  let title = "";
  const headingAt: number[] = [];
  lines.forEach((line, index) => {
    if (line.startsWith("## ")) headingAt.push(index);
    else if (line.startsWith("# ") && !title) title = line.slice(2).trim();
  });
  if (!title) issues.push({ line: 1, message: "文稿需要一个一级标题，例如 # 社区图书角。" });
  if (headingAt.length === 0) issues.push({ line: 1, message: "至少用一个 ## 标题表示一张幻灯片。" });
  if (headingAt.length > 40) issues.push({ line: headingAt[40]! + 1, message: "一次最多解析 40 张幻灯片。原文已保留，超出的页不会被静默删除，请拆开后再确认。" });

  const sections = headingAt.slice(0, 40).map((start, index) => readSection(lines, start, headingAt[index + 1] ?? lines.length, index, issues));
  if (issues.length === 0 && sections.length > 0) {
    try {
      parseOutline(sections);
    } catch (error) {
      issues.push({ line: 1, message: error instanceof Error ? error.message : "大纲结构不正确。" });
    }
  }
  return { title, sections, issues };
}

function readSection(lines: string[], start: number, end: number, index: number, issues: MarkdownIssue[]): OutlineSection {
  const heading = lines[start]?.slice(3).trim() ?? "";
  const block = lines.slice(start + 1, end);
  let id = `s${index + 1}`;
  let kind: SectionKind | undefined;
  let subtitle = "";
  let intent: DiagramIntent | undefined;
  let chartType: ChartSpec["type"] | undefined;
  const bullets: string[] = [];
  const tableLines: Array<{ line: number; text: string }> = [];
  block.forEach((raw, offset) => {
    const lineNo = start + 2 + offset;
    const line = raw.trim();
    const idMatch = /^<!--\s*id:\s*([A-Za-z0-9_-]+)\s*-->$/.exec(line);
    if (idMatch) {
      id = idMatch[1] ?? id;
      return;
    }
    if (line.startsWith("kind:")) {
      const value = line.slice(5).trim();
      if (!KINDS.has(value)) issues.push({ line: lineNo, message: `不认识的 kind：${value}。只能是 title、bullets、table、diagram、chart。` });
      else kind = value as SectionKind;
      return;
    }
    if (line.startsWith("subtitle:")) {
      subtitle = line.slice(9).trim();
      return;
    }
    if (line.startsWith("diagram:")) {
      const value = line.slice(8).trim();
      if (!INTENTS.has(value)) issues.push({ line: lineNo, message: "diagram 只能是 flow、org、architecture、relation。" });
      else intent = value as DiagramIntent;
      return;
    }
    if (line.startsWith("chart:")) {
      const value = line.slice(6).trim();
      if (!CHARTS.has(value)) issues.push({ line: lineNo, message: "chart 只能是 bar、line、pie。" });
      else chartType = value as ChartSpec["type"];
      return;
    }
    if (line.startsWith("- ")) bullets.push(line.slice(2).trim());
    if (line.startsWith("|")) tableLines.push({ line: lineNo, text: line });
  });
  if (!heading) issues.push({ line: start + 1, message: "幻灯片标题不能为空。" });
  if (!kind) issues.push({ line: start + 1, message: `「${heading || "未命名"}」缺少 kind。` });
  const section: OutlineSection = { id, kind: kind ?? "bullets", title: heading || "未命名" };
  if (kind === "title") section.subtitle = subtitle;
  if (kind === "bullets" || kind === "diagram") section.bullets = bullets.filter(Boolean);
  if (kind === "diagram") {
    section.diagramIntent = intent;
    if (!intent) issues.push({ line: start + 1, message: `「${heading}」是图，需要 diagram: flow、org、architecture 或 relation。` });
    if ((section.bullets?.length ?? 0) < 2) issues.push({ line: start + 1, message: `「${heading}」至少要有两个「- 」节点。` });
  }
  if (kind === "bullets" && (section.bullets?.length ?? 0) < 1) issues.push({ line: start + 1, message: `「${heading}」至少要有一条要点。` });
  if (kind === "table" || kind === "chart") {
    const table = readPipeTable(tableLines, issues);
    if (!table) issues.push({ line: start + 1, message: `「${heading}」缺少表格。用 | 分隔列。` });
    else if (kind === "table") section.table = table;
    else {
      if (!chartType) issues.push({ line: start + 1, message: `「${heading}」缺少 chart: bar、line 或 pie。` });
      const chart = table ? tableToChart(table, chartType ?? "bar", heading) : undefined;
      if (chart) section.chart = chart;
      else if (table) issues.push({ line: tableLines[0]?.line ?? start + 1, message: "图表的第二列必须是数字。" });
    }
  }
  return section;
}

function readPipeTable(rows: Array<{ line: number; text: string }>, issues: MarkdownIssue[]): TableSpec | undefined {
  const parsed = rows
    .map((row) => ({ line: row.line, cells: splitPipe(row.text) }))
    .filter((row) => !row.cells.every((cell) => /^:?-+:?$/.test(cell)));
  if (parsed.length < 2) return undefined;
  const headers = parsed[0]!.cells;
  const body = parsed.slice(1);
  body.forEach((row) => {
    if (row.cells.length !== headers.length) issues.push({ line: row.line, message: "这一行的列数和表头不一致。" });
  });
  return { headers, rows: body.map((row) => row.cells) };
}

function splitPipe(line: string): string[] {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function tableToChart(table: TableSpec, type: ChartSpec["type"], title: string): ChartSpec | undefined {
  const values = table.rows.map((row) => Number(row[1]));
  if (values.some((value) => !Number.isFinite(value))) return undefined;
  return {
    type,
    categories: table.rows.map((row) => row[0] ?? ""),
    series: [{ name: table.headers[1] || title, values }],
  };
}

export function tightenMarkdown(markdown: string, headingId?: string): string {
  if (!headingId) {
    return markdown.replace(/^# (.+)$/m, (_line, title: string) => (title.endsWith("（收紧）") ? `# ${title}` : `# ${title}（收紧）`));
  }
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]?.startsWith("## ")) continue;
    const nearby = lines.slice(index, index + 5).join("\n");
    if (!nearby.includes(`<!-- id: ${headingId} -->`)) continue;
    const title = lines[index]!.slice(3);
    if (!title.endsWith("（收紧）")) lines[index] = `## ${title}（收紧）`;
  }
  return lines.join("\n");
}

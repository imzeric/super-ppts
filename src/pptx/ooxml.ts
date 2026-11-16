import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { AppError } from "../domain/errors";
import type { Anchor, Diagram, DiagramNode } from "../domain/types";

type SlideLike = {
  kind: string;
  diagram?: Diagram;
  diagrams?: Array<{ diagram: Diagram; prefix: string }>;
  allowImages?: boolean;
};

const ANCHOR_INDEX: Record<Exclude<Anchor, "auto">, number> = {
  top: 0,
  right: 1,
  bottom: 2,
  left: 3,
};

export function bindDiagramConnectors(input: Uint8Array, slides: SlideLike[]): Uint8Array {
  const files = unzipSync(input);
  slides.forEach((slide, index) => {
    const path = `ppt/slides/slide${index + 1}.xml`;
    const bytes = files[path];
    if (!bytes) return;
    let xml = strFromU8(bytes);
    if (slide.kind === "diagram" && slide.diagram) xml = insertConnectors(xml, slide.diagram, "node-");
    for (const item of slide.diagrams ?? []) xml = insertConnectors(xml, item.diagram, item.prefix);
    files[path] = strToU8(xml);
  });
  const allowImages = slides.some((slide) => slide.allowImages);
  for (const name of Object.keys(files)) {
    if (name.startsWith("ppt/media/") && !name.endsWith("/") && !allowImages) {
      throw new AppError("UNSUPPORTED_EXPORT", "导出里出现了图片部件。只有明确选择插图时才写入位图。", 422);
    }
    if ((name === "ppt/media" || name === "ppt/media/") && !allowImages) delete files[name];
  }
  return zipSync(files);
}

function insertConnectors(xml: string, diagram: Diagram, prefix: string): string {
  const shapes = readShapeNames(xml);
  const idByNode = new Map<string, string>();
  for (const shape of shapes) {
    if (shape.name.startsWith(prefix)) idByNode.set(shape.name.slice(prefix.length), shape.id);
  }
  let nextId = shapes.reduce((max, shape) => Math.max(max, Number(shape.id)), 2);
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const parts: string[] = [];
  for (const edge of diagram.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    const sourceId = idByNode.get(edge.source);
    const targetId = idByNode.get(edge.target);
    if (!source || !target || !sourceId || !targetId) {
      throw new AppError("EXPORT_CONNECTOR_BIND", "有一条连接线找不到两端的形状，导出已停止。", 500);
    }
    const anchors = resolveAnchors(source, target, edge.sourceAnchor, edge.targetAnchor);
    const start = port(source, anchors.source);
    const end = port(target, anchors.target);
    const frame = connectorFrame(start.x, start.y, end.x, end.y);
    nextId += 1;
    const preset = edge.routing === "orthogonal" ? "bentConnector3" : "straightConnector1";
    const flipH = frame.flipH ? ' flipH="1"' : "";
    const flipV = frame.flipV ? ' flipV="1"' : "";
    parts.push(
      `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${nextId}" name="edge-${escapeXml(edge.id)}"/><p:cNvCxnSpPr><a:stCxn id="${sourceId}" idx="${ANCHOR_INDEX[anchors.source]}"/><a:endCxn id="${targetId}" idx="${ANCHOR_INDEX[anchors.target]}"/></p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${flipH}${flipV}><a:off x="${frame.x}" y="${frame.y}"/><a:ext cx="${frame.cx}" cy="${frame.cy}"/></a:xfrm><a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="${diagram.theme.ink}"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>`,
    );
  }
  if (!xml.includes("</p:spTree>")) {
    throw new AppError("EXPORT_CONNECTOR_BIND", "幻灯片结构异常，连接线没有写入。", 500);
  }
  return xml.replace("</p:spTree>", `${parts.join("")}</p:spTree>`);
}

function readShapeNames(xml: string): Array<{ id: string; name: string }> {
  const found: Array<{ id: string; name: string }> = [];
  for (const match of xml.matchAll(/<p:cNvPr\b([^>]*?)(?:\/>|>)/g)) {
    const chunk = match[1] ?? "";
    const id = /(?:^|\s)id="(\d+)"/.exec(chunk)?.[1];
    const name = /(?:^|\s)name="([^"]*)"/.exec(chunk)?.[1];
    if (id && name) found.push({ id, name });
  }
  return found;
}

export function resolveAnchors(
  source: DiagramNode,
  target: DiagramNode,
  sourceAnchor: Anchor,
  targetAnchor: Anchor,
): { source: Exclude<Anchor, "auto">; target: Exclude<Anchor, "auto"> } {
  if (sourceAnchor !== "auto" && targetAnchor !== "auto") return { source: sourceAnchor, target: targetAnchor };
  const dx = target.x + target.w / 2 - (source.x + source.w / 2);
  const dy = target.y + target.h / 2 - (source.y + source.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: "right", target: "left" } : { source: "left", target: "right" };
  }
  return dy >= 0 ? { source: "bottom", target: "top" } : { source: "top", target: "bottom" };
}

function port(node: DiagramNode, anchor: Exclude<Anchor, "auto">): { x: number; y: number } {
  if (anchor === "top") return { x: node.x + node.w / 2, y: node.y };
  if (anchor === "right") return { x: node.x + node.w, y: node.y + node.h / 2 };
  if (anchor === "bottom") return { x: node.x + node.w / 2, y: node.y + node.h };
  return { x: node.x, y: node.y + node.h / 2 };
}

function connectorFrame(x1: number, y1: number, x2: number, y2: number) {
  let flipH = 0;
  let flipV = 0;
  let x = x1;
  let y = y1;
  let cx = x2 - x1;
  let cy = y2 - y1;
  if (cx < 0) {
    flipH = 1;
    x = x2;
    cx = -cx;
  }
  if (cy < 0) {
    flipV = 1;
    y = y2;
    cy = -cy;
  }
  return { x: Math.round(x), y: Math.round(y), cx: Math.max(1, Math.round(cx)), cy: Math.max(1, Math.round(cy)), flipH, flipV };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

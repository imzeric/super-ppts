import { PNG } from "pngjs";
import type { Diagram } from "../domain/types";

export function diagramToSvg(diagram: Diagram, width: number, height: number): string {
  const shapes = diagram.nodes
    .map((node) => {
      const label = escapeXml(node.label);
      if (node.shape === "ellipse") {
        return `<ellipse cx="${node.x + node.w / 2}" cy="${node.y + node.h / 2}" rx="${node.w / 2}" ry="${node.h / 2}" fill="#${diagram.theme.paper}" stroke="#${diagram.theme.ink}" stroke-width="20000"/><text x="${node.x + node.w / 2}" y="${node.y + node.h / 2}" text-anchor="middle" font-size="140000" fill="#${diagram.theme.ink}">${label}</text>`;
      }
      const radius = node.shape === "roundRect" ? 80000 : 0;
      return `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${radius}" fill="#${diagram.theme.paper}" stroke="#${diagram.theme.ink}" stroke-width="20000"/><text x="${node.x + node.w / 2}" y="${node.y + node.h / 2}" text-anchor="middle" font-size="140000" fill="#${diagram.theme.ink}">${label}</text>`;
    })
    .join("");
  const lines = diagram.edges
    .map((edge) => {
      const source = diagram.nodes.find((node) => node.id === edge.source);
      const target = diagram.nodes.find((node) => node.id === edge.target);
      if (!source || !target) return "";
      return `<line x1="${source.x + source.w / 2}" y1="${source.y + source.h / 2}" x2="${target.x + target.w / 2}" y2="${target.y + target.h / 2}" stroke="#${diagram.theme.ink}" stroke-width="18000"/>`;
    })
    .join("");
  return sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${lines}${shapes}</svg>`);
}

export function diagramToPng(diagram: Diagram, widthEmu: number, heightEmu: number): Buffer {
  const width = 960;
  const height = Math.max(1, Math.round((width * heightEmu) / widthEmu));
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 246;
    png.data[i + 1] = 241;
    png.data[i + 2] = 232;
    png.data[i + 3] = 255;
  }
  const scaleX = width / widthEmu;
  const scaleY = height / heightEmu;
  for (const edge of diagram.edges) {
    const source = diagram.nodes.find((node) => node.id === edge.source);
    const target = diagram.nodes.find((node) => node.id === edge.target);
    if (!source || !target) continue;
    stroke(
      png,
      (source.x + source.w / 2) * scaleX,
      (source.y + source.h / 2) * scaleY,
      (target.x + target.w / 2) * scaleX,
      (target.y + target.h / 2) * scaleY,
    );
  }
  for (const node of diagram.nodes) {
    fillRect(png, node.x * scaleX, node.y * scaleY, node.w * scaleX, node.h * scaleY);
  }
  return PNG.sync.write(png);
}

export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*(['"])(?!#).*?\1/gi, "");
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

function fillRect(png: PNG, x: number, y: number, w: number, h: number) {
  const x0 = clamp(Math.round(x), 0, png.width - 1);
  const y0 = clamp(Math.round(y), 0, png.height - 1);
  const x1 = clamp(Math.round(x + w), 0, png.width);
  const y1 = clamp(Math.round(y + h), 0, png.height);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const index = (png.width * py + px) << 2;
      const border = px === x0 || py === y0 || px === x1 - 1 || py === y1 - 1;
      png.data[index] = border ? 28 : 200;
      png.data[index + 1] = border ? 25 : 69;
      png.data[index + 2] = border ? 22 : 47;
      png.data[index + 3] = 255;
    }
  }
}

function stroke(png: PNG, x1: number, y1: number, x2: number, y2: number) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let step = 0; step <= steps; step += 1) {
    const px = clamp(Math.round(x1 + ((x2 - x1) * step) / steps), 0, png.width - 1);
    const py = clamp(Math.round(y1 + ((y2 - y1) * step) / steps), 0, png.height - 1);
    const index = (png.width * py + px) << 2;
    png.data[index] = 28;
    png.data[index + 1] = 25;
    png.data[index + 2] = 22;
    png.data[index + 3] = 255;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

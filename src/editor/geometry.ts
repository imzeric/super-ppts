export type Frame = { x: number; y: number; w: number; h: number };

export function clientDeltaToEmu(deltaPx: number, viewportPx: number, slideEmu: number): number {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(viewportPx) || viewportPx <= 0 || !Number.isFinite(slideEmu)) return 0;
  return Math.round((deltaPx / viewportPx) * slideEmu);
}

export function clampFrame(frame: Frame, slideW: number, slideH: number): Frame {
  const minW = 600_000;
  const minH = 400_000;
  const w = Math.min(slideW, Math.max(minW, Math.round(frame.w)));
  const h = Math.min(slideH, Math.max(minH, Math.round(frame.h)));
  const x = Math.min(Math.max(0, Math.round(frame.x)), Math.max(0, slideW - w));
  const y = Math.min(Math.max(0, Math.round(frame.y)), Math.max(0, slideH - h));
  return { x, y, w, h };
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";

export function resizeFrame(start: Frame, handle: Handle, dxEmu: number, dyEmu: number, slideW: number, slideH: number): Frame {
  let { x, y, w, h } = start;
  if (handle === "move") return clampFrame({ x: x + dxEmu, y: y + dyEmu, w, h }, slideW, slideH);
  if (handle.includes("e")) w += dxEmu;
  if (handle.includes("s")) h += dyEmu;
  if (handle.includes("w")) {
    x += dxEmu;
    w -= dxEmu;
  }
  if (handle.includes("n")) {
    y += dyEmu;
    h -= dyEmu;
  }
  return clampFrame({ x, y, w, h }, slideW, slideH);
}

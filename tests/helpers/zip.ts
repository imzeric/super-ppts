import { strFromU8, unzipSync } from "fflate";

export function unzip(data: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(data);
}

export function textFiles(files: Record<string, Uint8Array>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith(".xml") || name.endsWith(".rels")) out[name] = strFromU8(bytes);
  }
  return out;
}

export function shapeNames(xml: string): Array<{ id: string; name: string }> {
  const found: Array<{ id: string; name: string }> = [];
  const re = /<p:cNvPr\b([^>]*?)(?:\/>|>)/g;
  for (const match of xml.matchAll(re)) {
    const chunk = match[1] ?? "";
    const id = /(?:^|\s)id="(\d+)"/.exec(chunk)?.[1];
    const name = /(?:^|\s)name="([^"]*)"/.exec(chunk)?.[1];
    if (id && name) found.push({ id, name });
  }
  return found;
}

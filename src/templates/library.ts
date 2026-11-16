export type TemplateId = "none" | "minutes" | "lecture" | "night";

export type DeckTemplate = {
  id: TemplateId;
  name: string;
  description: string;
  ink: string;
  paper: string;
  accent: string;
  font: string;
  titleSize: number;
  inset: number;
};

export const TEMPLATES: DeckTemplate[] = [
  {
    id: "none",
    name: "不使用模板",
    description: "墨色字，骨色纸。这是默认，不是外部模板。",
    ink: "1C1916",
    paper: "F6F1E8",
    accent: "C8452F",
    font: "Microsoft YaHei",
    titleSize: 28,
    inset: 0.55,
  },
  {
    id: "minutes",
    name: "纪要",
    description: "蓝灰纸面，标题紧凑，适合会议记录。",
    ink: "1E2A32",
    paper: "E7EEF2",
    accent: "2F5D73",
    font: "Microsoft YaHei",
    titleSize: 24,
    inset: 0.42,
  },
  {
    id: "lecture",
    name: "讲义",
    description: "深绿色标题，边距更宽。",
    ink: "1D3328",
    paper: "F3F6EF",
    accent: "3E6B45",
    font: "Microsoft YaHei",
    titleSize: 32,
    inset: 0.8,
  },
  {
    id: "night",
    name: "夜场",
    description: "深色幻灯片，浅色字。",
    ink: "F4EFE6",
    paper: "1A1916",
    accent: "E07A5F",
    font: "Microsoft YaHei",
    titleSize: 28,
    inset: 0.6,
  },
];

export function findTemplate(id: string | undefined): DeckTemplate {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0]!;
}

export const SLIDE_SIZES = [
  { id: "16:9", label: "16:9 宽屏", widthEmu: 12_192_000, heightEmu: 6_858_000 },
  { id: "4:3", label: "4:3 标准", widthEmu: 9_144_000, heightEmu: 6_858_000 },
  { id: "16:10", label: "16:10", widthEmu: 12_192_000, heightEmu: 7_620_000 },
] as const;

export type AspectId = (typeof SLIDE_SIZES)[number]["id"];

export function findSize(id: string | undefined) {
  return SLIDE_SIZES.find((size) => size.id === id) ?? SLIDE_SIZES[0]!;
}

import type { OutlineSection } from "../domain/types";

export const DEMO_SECTIONS: OutlineSection[] = [
  {
    id: "sec-title",
    kind: "title",
    title: "社区图书角三个月试点",
    subtitle: "居民借阅与志愿服务",
  },
  {
    id: "sec-bullets",
    kind: "bullets",
    title: "试点做了什么",
    bullets: ["门口登记姓名和册数", "每周三个晚间志愿班", "逾期图书由书架管理员提醒"],
  },
  {
    id: "sec-table",
    kind: "table",
    title: "三个月记录",
    table: {
      headers: ["月份", "新登记", "志愿班次"],
      rows: [
        ["一月", "42", "8"],
        ["二月", "55", "9"],
        ["三月", "63", "11"],
      ],
    },
  },
  {
    id: "sec-diagram",
    kind: "diagram",
    title: "一次借阅怎么走",
    bullets: ["到馆登记", "挑选图书", "办理借出", "按期归还"],
  },
  {
    id: "sec-chart",
    kind: "chart",
    title: "每月借阅册数",
    chart: {
      type: "bar",
      categories: ["一月", "二月", "三月"],
      series: [{ name: "借阅册数", values: [42, 55, 63] }],
    },
  },
];

export function cloneSections(sections: OutlineSection[]): OutlineSection[] {
  return structuredClone(sections);
}

export function tightenSections(sections: OutlineSection[], sectionId?: string): OutlineSection[] {
  return sections.map((section) => {
    if (sectionId && section.id !== sectionId) return section;
    if (section.title.endsWith("（收紧）")) return section;
    return { ...section, title: `${section.title}（收紧）` };
  });
}

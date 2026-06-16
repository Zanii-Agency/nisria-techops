import { humanize } from "../humanize";

// Task board renderer with 4 styles. The MODEL picks the style based on the
// user's intent (the picker rules live in Sasa's system prompt); the
// RENDERER guarantees the visual contract. Same content, four shapes.
//
// Why this lives server-side, not in the model:
//   - Model output was non-deterministic on formatting (categorized brief
//     at 15:10, flat numbered at 16:35, on the same kind of question).
//   - The pre-rendered string is returned alongside the raw data so the
//     model can echo it verbatim with optional 1-sentence framing prose.
//   - Address grammar ("done 1.1" / "done II.A") maps deterministically to
//     section-row tuples for the cleanup flow's parser.

export type Style = "decimal" | "legal" | "bullets" | "flat";

export type RawTask = {
  id?: string;
  title: string;
  status?: string;
  priority?: string | null;
  due?: string | null;
  due_on?: string | null;
  important?: boolean;
  task_type?: string;
  assignee?: string | null;
  _bucket?: string;
};

const SECTION_ORDER: { bucket: string; label: string }[] = [
  { bucket: "important_urgent", label: "Important + urgent" },
  { bucket: "urgent_only", label: "Urgent" },
  { bucket: "important_only", label: "Important" },
  { bucket: "neither", label: "Everything else" },
];

const DUE_TODAY_LABEL = "Due today";
const OVERDUE_LABEL = "Overdue";

type Section = { label: string; tasks: RawTask[] };

function partition(tasks: RawTask[], today: string): Section[] {
  const due_today: RawTask[] = [];
  const overdue: RawTask[] = [];
  const byBucket: Record<string, RawTask[]> = {};
  for (const t of tasks) {
    const due = t.due ?? t.due_on ?? null;
    if (due && due < today) { overdue.push(t); continue; }
    if (due && due === today) { due_today.push(t); continue; }
    const bucket = t._bucket || "neither";
    (byBucket[bucket] ||= []).push(t);
  }
  const sections: Section[] = [];
  if (due_today.length) sections.push({ label: DUE_TODAY_LABEL, tasks: due_today });
  if (overdue.length) sections.push({ label: OVERDUE_LABEL, tasks: overdue });
  for (const { bucket, label } of SECTION_ORDER) {
    const list = byBucket[bucket] || [];
    if (list.length) sections.push({ label, tasks: list });
  }
  return sections;
}

function toRoman(n: number): string {
  const m: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "", x = n;
  for (const [v, s] of m) { while (x >= v) { out += s; x -= v; } }
  return out;
}

function toAlpha(n: number): string {
  // 1 → A, 2 → B, …, 26 → Z, 27 → AA, 28 → AB
  let s = "", x = n;
  while (x > 0) { x--; s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26); }
  return s;
}

function taskLine(t: RawTask): string {
  const safeTitle = humanize(t.title || "(untitled)");
  const parts: string[] = [safeTitle];
  const due = t.due ?? t.due_on ?? null;
  if (due) parts[0] += `, due ${due}`;
  if (t.priority === "high") parts[0] += ", high";
  return parts[0];
}

export function renderDecimal(sections: Section[]): string {
  const lines: string[] = [];
  sections.forEach((sec, si) => {
    const sNum = si + 1;
    const count = sec.tasks.length > 1 ? ` (${sec.tasks.length})` : "";
    lines.push(`${sNum}. ${sec.label}${count}`);
    sec.tasks.forEach((t, ti) => {
      lines.push(`   ${sNum}.${ti + 1}  ${taskLine(t)}`);
    });
  });
  return lines.join("\n");
}

export function renderLegal(sections: Section[]): string {
  const lines: string[] = [];
  sections.forEach((sec, si) => {
    const sRom = toRoman(si + 1);
    const count = sec.tasks.length > 1 ? ` (${sec.tasks.length})` : "";
    lines.push(`${sRom}.   ${sec.label}${count}`);
    sec.tasks.forEach((t, ti) => {
      lines.push(`      ${toAlpha(ti + 1)}.  ${taskLine(t)}`);
    });
  });
  return lines.join("\n");
}

export function renderBullets(sections: Section[]): string {
  const lines: string[] = [];
  sections.forEach((sec) => {
    const count = sec.tasks.length > 1 ? ` (${sec.tasks.length})` : "";
    lines.push(`• ${sec.label}${count}`);
    for (const t of sec.tasks) {
      lines.push(`   ○ ${taskLine(t)}`);
    }
  });
  return lines.join("\n");
}

export function renderFlat(sections: Section[]): string {
  // One flat numbered list across all sections, with the bucket name
  // appended inline so the priority signal isn't lost.
  const lines: string[] = [];
  let n = 1;
  for (const sec of sections) {
    for (const t of sec.tasks) {
      const tag = sec.label !== "Everything else" ? ` — ${sec.label.toLowerCase()}` : "";
      lines.push(`${String(n).padStart(2, " ")}. ${taskLine(t)}${tag}`);
      n++;
    }
  }
  return lines.join("\n");
}

const ACTION_HINTS: Record<Style, string> = {
  decimal: 'Reply: "done 1.1", "drop 2.1, 2.2", "edit 1.1: <new title>".',
  legal: 'Reply: "done II.A", "drop II.B, II.C", "edit I.A: <new title>".',
  bullets: 'For actions, ask "switch to numbered".',
  flat: 'Reply: "done 1", "drop 2, 3", "edit 4: <new title>".',
};

export function renderBoard(tasks: RawTask[], style: Style, today: string): string {
  if (!tasks.length) return "Your board is empty.";
  const sections = partition(tasks, today);
  let body: string;
  if (style === "decimal") body = renderDecimal(sections);
  else if (style === "legal") body = renderLegal(sections);
  else if (style === "bullets") body = renderBullets(sections);
  else body = renderFlat(sections);
  return `${body}\n\n${ACTION_HINTS[style]}`;
}

// STYLE PICKER (used in Sasa's system prompt as guidance; this exported
// helper is the same logic the smart-tools layer uses when the model
// passes a `style: "auto"` input). Keeping it here so the model's
// instructions and the deterministic fallback never drift apart.
export function pickStyle(opts: {
  command: string;
  taskCount: number;
}): Style {
  const t = (opts.command || "").toLowerCase();
  if (/\b(?:bullets?|bulleted)\b/.test(t)) return "bullets";
  if (/\b(?:legal|roman|formal|outline\s*format)\b/.test(t)) return "legal";
  if (/\b(?:flat|simple|short\s*list|one\s*line|just\s*list)\b/.test(t)) return "flat";
  if (/\b(?:decimal|numbered|categori[zs]ed|structured|hierarch(?:y|ical))\b/.test(t)) return "decimal";
  // Heuristics on intent + size:
  if (opts.taskCount <= 5) return "flat";
  if (/\b(?:summary|overview|brief|sense|glance|quick\s+(?:look|check))\b/.test(t)) return "bullets";
  if (/\b(?:clean|clear|review|tidy|sort|prune|delete|drop|remove|done|finished?)\b/.test(t)) return "decimal";
  return "decimal";
}

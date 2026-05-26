// The Brain's section schema. Single source of truth for the onboarding flow in
// Settings: what we ask, the warm plain-language copy, and how each section maps
// into agent_memory so recall() surfaces it. Server action + UI both import this
// so they never drift.

export type SectionKey =
  | "overview"
  | "programs"
  | "events"
  | "losses"
  | "assets"
  | "people"
  | "voice"
  | "other"
  // Grant-readiness group (R2-4 / #37): the standard inputs funders almost
  // always require. Captured here once, they ground every grant package and
  // feed the standard documents funders ask for.
  | "legal"
  | "financials"
  | "impact"
  | "leadership"
  | "narrative";

// Which group a section belongs to. "story" is the original warm onboarding;
// "grant" is the funder-readiness block. The UI renders the two groups as
// separate panels so neither feels cluttered.
export type SectionGroup = "story" | "grant";

export type BrainSection = {
  key: SectionKey;
  label: string;
  blurb: string;        // warm one-liner under the heading
  placeholder: string;  // example text in the box
  icon: string;         // lucide icon name (resolved in the client component)
  // how this section becomes a memory the agents can recall
  memKind: "org_fact" | "brand_voice";
  memTitle: string;
  group?: SectionGroup; // defaults to "story" when omitted
  // R3-4 / P10: a multi-entry section holds a LIST of records (different
  // projects), not a single textarea. Each entry is its own brain_entries row,
  // shown in the panel and openable in a FocusTab. The grant "Programs and
  // impact" and the Brain "Programs" are the natural multi-entry sections: a
  // nonprofit runs several distinct programs/projects and a funder wants each.
  // `entryLabel` names one entry ("program", "project") in the add-entry UI.
  multi?: boolean;
  entryLabel?: string;
};

export const BRAIN_SECTIONS: BrainSection[] = [
  {
    key: "overview",
    label: "About Nisria",
    blurb: "Who you are and why you exist. The heart of it, in your own words.",
    placeholder:
      "By Nisria Inc is a US nonprofit helping children and families in Kenya. Our mission is... We started because...",
    icon: "Heart",
    memKind: "org_fact",
    memTitle: "Org overview and mission",
  },
  {
    key: "programs",
    label: "Programs",
    blurb: "What you actually do on the ground. Safe House, education, rescue, nutrition, anything. Add each program as its own entry.",
    placeholder:
      "Safe House: shelters children who... Education: covers school fees and uniforms for... Nutrition: daily meals for...",
    icon: "Sprout",
    memTitle: "Programs Nisria runs",
    memKind: "org_fact",
    multi: true,
    entryLabel: "program",
  },
  {
    key: "events",
    label: "Key moments",
    blurb: "The milestones. What happened and roughly when. Big and small.",
    placeholder:
      "2021: opened the Safe House. 2023: first 30 children sponsored. Use one line per moment.",
    icon: "CalendarClock",
    memTitle: "Key events in Nisria's history",
    memKind: "org_fact",
  },
  {
    key: "losses",
    label: "Hard lessons",
    blurb: "What you lost, what went wrong, what you learned. This keeps the agents honest and humble.",
    placeholder:
      "A funder pulled out in 2022 and we learned to never rely on one source. We lost...",
    icon: "ShieldAlert",
    memTitle: "Hard lessons and losses",
    memKind: "org_fact",
  },
  {
    key: "assets",
    label: "What you hold",
    blurb: "Property, partnerships, recurring funders, anything you own or rely on.",
    placeholder:
      "We own the Safe House land in... Recurring funders: ... Partnership with ... The Folklore shop on...",
    icon: "Landmark",
    memTitle: "Key assets and partnerships",
    memKind: "org_fact",
  },
  {
    key: "people",
    label: "Key people",
    blurb: "Board, major donors, partners, the people who matter to the story.",
    placeholder:
      "Nur (founder). Board: ... Major donors: ... Field lead in Nairobi: ... Keep names and how they relate.",
    icon: "Users",
    memTitle: "Key people and relationships",
    memKind: "org_fact",
  },
  {
    key: "voice",
    label: "How Nisria sounds",
    blurb: "Your tone and the words you use. The agents will write in this voice. Add do's and don'ts.",
    placeholder:
      "Warm, hopeful, never guilt-trippy. We say 'children and families', not 'victims'. Don't use jargon. Sign off simply.",
    icon: "MessageSquareQuote",
    memTitle: "Nisria brand voice and tone",
    memKind: "brand_voice",
  },
  {
    key: "other",
    label: "Anything else",
    blurb: "Whatever else the agents should know. No wrong answers here.",
    placeholder: "Anything that matters and didn't fit above.",
    icon: "NotebookPen",
    memTitle: "Other org context",
    memKind: "org_fact",
  },

  // ---- Grant readiness ----
  // The standard inputs funders ask for, captured once. Every field is optional
  // and saves on its own; nothing here ever blocks. These persist to org_profile
  // and mirror into agent_memory as org_fact, so recall() grounds every grant
  // package and the standard documents in real org facts.
  {
    key: "legal",
    label: "Legal and registration",
    blurb: "The official details funders verify. Legal name, your number, where you are registered.",
    placeholder:
      "Legal name: By Nisria Inc. EIN: 88-3508268. Status: 501(c)(3) (or fiscal sponsor: ...). Incorporated in: Florida, USA. Year founded: 20XX. Registered address: ...",
    icon: "FileBadge",
    memTitle: "Legal registration and status",
    memKind: "org_fact",
    group: "grant",
  },
  {
    key: "financials",
    label: "Money and budget",
    blurb: "The shape of your finances. Rough numbers are fine. A link to your records is fine too.",
    placeholder:
      "Annual budget: about $X. Last year: roughly $X in, $X out. Top funding sources: Givebutter donors, major gifts, ... Fiscal year ends: Dec 31. Audited financials live at: [link, if you have one].",
    icon: "Wallet",
    memTitle: "Financial profile and budget",
    memKind: "org_fact",
    group: "grant",
  },
  {
    key: "impact",
    label: "Programs and impact",
    blurb: "Each project you run and the difference it makes, in numbers where you have them. Add a separate entry per project so funders can see them distinctly.",
    placeholder:
      "Project: Safe House. Beneficiaries served: about X children. Key outcomes: X children sheltered, X reunified... Geography: Gilgil, Kenya. Budget: about $X.",
    icon: "TrendingUp",
    memTitle: "Programs, beneficiaries and impact metrics",
    memKind: "org_fact",
    group: "grant",
    multi: true,
    entryLabel: "project",
  },
  {
    key: "leadership",
    label: "Board and leadership",
    blurb: "The people funders want named. Board, key staff, and a short founder bio.",
    placeholder:
      "Board members: ... Key staff: ... Founder: Nur ... (a few lines on background and why she started Nisria).",
    icon: "UserCheck",
    memTitle: "Board, leadership and founder bio",
    memKind: "org_fact",
    group: "grant",
  },
  {
    key: "narrative",
    label: "Mission, need and approach",
    blurb: "Your story funders read: the mission, the need you meet, and how your work creates change.",
    placeholder:
      "Mission: ... The need: the children and families we serve face... Our approach (theory of change in plain terms): we do A, which leads to B, which results in C...",
    icon: "BookOpenText",
    memTitle: "Mission, need statement and theory of change",
    memKind: "org_fact",
    group: "grant",
  },
];

export const SECTION_KEYS = BRAIN_SECTIONS.map((s) => s.key);

// R3-4 / P10: sections that hold a LIST of entries (different projects) rather
// than a single textarea. The UI renders these with an add-entry affordance and
// a visible list; each entry is its own brain_entries row openable in a FocusTab.
export const MULTI_SECTION_KEYS = BRAIN_SECTIONS.filter((s) => s.multi).map((s) => s.key);
export function isMultiSection(key: string): boolean {
  return !!BRAIN_SECTIONS.find((s) => s.key === key && s.multi);
}
export function sectionSpec(key: string): BrainSection | undefined {
  return BRAIN_SECTIONS.find((s) => s.key === key);
}

// Sections by group. The "story" group is the original warm onboarding; the
// "grant" group is the funder-readiness block. Helpers so the UI never drifts.
export function sectionsByGroup(group: SectionGroup): BrainSection[] {
  return BRAIN_SECTIONS.filter((s) => (s.group || "story") === group);
}

export const STORY_SECTIONS = sectionsByGroup("story");
export const GRANT_SECTIONS = sectionsByGroup("grant");

// completeness for a given group (sections with real content / total in group)
export function groupCompleteness(
  group: SectionGroup,
  filled: Record<string, boolean>
): { done: number; total: number; pct: number } {
  const sections = sectionsByGroup(group);
  const total = sections.length;
  const done = sections.filter((s) => filled[s.key]).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// completeness across the original story sections (kept for back-compat with the
// existing Brain meter; the grant group has its own meter).
export function brainCompleteness(filled: Record<string, boolean>): {
  done: number;
  total: number;
  pct: number;
} {
  return groupCompleteness("story", filled);
}

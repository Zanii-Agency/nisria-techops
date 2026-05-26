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
  | "other";

export type BrainSection = {
  key: SectionKey;
  label: string;
  blurb: string;        // warm one-liner under the heading
  placeholder: string;  // example text in the box
  icon: string;         // lucide icon name (resolved in the client component)
  // how this section becomes a memory the agents can recall
  memKind: "org_fact" | "brand_voice";
  memTitle: string;
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
    blurb: "What you actually do on the ground. Safe House, education, rescue, nutrition, anything.",
    placeholder:
      "Safe House: shelters children who... Education: covers school fees and uniforms for... Nutrition: daily meals for...",
    icon: "Sprout",
    memTitle: "Programs Nisria runs",
    memKind: "org_fact",
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
];

export const SECTION_KEYS = BRAIN_SECTIONS.map((s) => s.key);

// completeness = sections with real content / total
export function brainCompleteness(filled: Record<string, boolean>): {
  done: number;
  total: number;
  pct: number;
} {
  const total = BRAIN_SECTIONS.length;
  const done = BRAIN_SECTIONS.filter((s) => filled[s.key]).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

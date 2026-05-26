"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Brain,
  Heart,
  Sprout,
  CalendarClock,
  ShieldAlert,
  Landmark,
  Users,
  MessageSquareQuote,
  NotebookPen,
  Check,
  ChevronDown,
  Save,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  FileBadge,
  Wallet,
  TrendingUp,
  UserCheck,
  BookOpenText,
} from "lucide-react";
import { STORY_SECTIONS, groupCompleteness, type SectionKey } from "../lib/brain";
import { saveBrainSection } from "../app/settings/actions";

// Icon registry shared with the grant-readiness panel.
export const BRAIN_ICONS: Record<string, LucideIcon> = {
  Heart,
  Sprout,
  CalendarClock,
  ShieldAlert,
  Landmark,
  Users,
  MessageSquareQuote,
  NotebookPen,
  FileBadge,
  Wallet,
  TrendingUp,
  UserCheck,
  BookOpenText,
};

const ICONS = BRAIN_ICONS;

type SavedMap = Record<string, string>; // section -> stored content

// The Brain. A warm, re-runnable onboarding that teaches the portal who Nisria
// is. Lives inside Settings. Each section saves on its own and can be edited any
// time. A simple completeness meter shows what's left, but never blocks usage.
export default function BrainOnboarding({ saved }: { saved: SavedMap }) {
  // which section is open for editing (accordion-style; first empty one opens)
  const firstEmpty = STORY_SECTIONS.find((s) => !(saved[s.key] || "").trim())?.key ?? STORY_SECTIONS[0].key;
  const [open, setOpen] = useState<SectionKey | null>(firstEmpty);

  // local view of what's filled (updates instantly after a save, no full reload)
  const [filledLocal, setFilledLocal] = useState<Record<string, boolean>>(
    Object.fromEntries(STORY_SECTIONS.map((s) => [s.key, !!(saved[s.key] || "").trim()]))
  );

  const completeness = useMemo(() => groupCompleteness("story", filledLocal), [filledLocal]);

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="card-h">
        <span className="flex">
          <Brain size={16} /> The Brain
        </span>
        <span className="badge teal">
          {completeness.done} of {completeness.total} captured
        </span>
      </div>

      <div className="card-pad stack" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 8 }}>
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
            This is how the portal learns who Nisria really is. The more you tell it here, the more every
            draft, brief, and reply sounds like you and stays true to your story. Fill in what you can,
            in your own words. You can come back and edit any of this whenever you like, nothing here is
            ever locked.
          </p>
          <div className="meter" style={{ marginTop: 2 }}>
            <span style={{ width: `${completeness.pct}%` }} />
          </div>
          <div className="faint" style={{ fontSize: 11.5 }}>
            {completeness.done === completeness.total
              ? "Every section has something. The Brain is well fed. You can still refine any of it."
              : `${completeness.total - completeness.done} section${
                  completeness.total - completeness.done > 1 ? "s" : ""
                } still empty. No rush, even a little helps.`}
          </div>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          {STORY_SECTIONS.map((s) => {
            const Icon = ICONS[s.icon] || NotebookPen;
            const isOpen = open === s.key;
            const isFilled = filledLocal[s.key];
            return (
              <SectionRow
                key={s.key}
                sectionKey={s.key}
                label={s.label}
                blurb={s.blurb}
                placeholder={s.placeholder}
                Icon={Icon}
                isOpen={isOpen}
                isFilled={isFilled}
                initial={saved[s.key] || ""}
                onToggle={() => setOpen(isOpen ? null : s.key)}
                onSaved={(hasContent) =>
                  setFilledLocal((m) => ({ ...m, [s.key]: hasContent }))
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SectionRow({
  sectionKey,
  label,
  blurb,
  placeholder,
  Icon,
  isOpen,
  isFilled,
  initial,
  onToggle,
  onSaved,
}: {
  sectionKey: SectionKey;
  label: string;
  blurb: string;
  placeholder: string;
  Icon: LucideIcon;
  isOpen: boolean;
  isFilled: boolean;
  initial: string;
  onToggle: () => void;
  onSaved: (hasContent: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const dirty = value.trim() !== initial.trim();

  function save() {
    const fd = new FormData();
    fd.set("section", sectionKey);
    fd.set("content", value);
    start(async () => {
      await saveBrainSection(fd);
      onSaved(!!value.trim());
      setSavedAt(Date.now());
    });
  }

  return (
    <div
      className="card"
      style={{
        boxShadow: "none",
        border: "1px solid var(--line)",
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="between"
        style={{
          width: "100%",
          padding: "13px 16px",
          background: "none",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span className="flex" style={{ gap: 11, minWidth: 0 }}>
          <span
            className="aico"
            style={{
              background: isFilled ? "var(--teal-50)" : "var(--canvas)",
              color: isFilled ? "var(--teal-700)" : "var(--muted)",
              width: 32,
              height: 32,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon size={16} />
          </span>
          <span className="stack" style={{ gap: 1, minWidth: 0 }}>
            <span className="strong" style={{ fontSize: 13.5 }}>
              {label}
            </span>
            <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
              {blurb}
            </span>
          </span>
        </span>
        <span className="flex" style={{ gap: 8, flexShrink: 0 }}>
          {isFilled ? (
            <span className="badge green" style={{ gap: 4 }}>
              <Check size={12} /> saved
            </span>
          ) : (
            <span className="badge gray">empty</span>
          )}
          <ChevronDown
            size={16}
            style={{
              color: "var(--muted)",
              transform: isOpen ? "rotate(180deg)" : "none",
              transition: "transform .15s var(--ease)",
            }}
          />
        </span>
      </button>

      {isOpen && (
        <div className="stack" style={{ gap: 10, padding: "0 16px 16px" }}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            rows={5}
            style={{ resize: "vertical", lineHeight: 1.6 }}
          />
          <div className="between">
            <span className="faint flex" style={{ fontSize: 11.5, gap: 6 }}>
              <Sparkles size={13} style={{ color: "var(--teal)" }} />
              {pending
                ? "Teaching the Brain..."
                : savedAt
                ? "Saved. The agents now know this."
                : "Saved here feeds Sasa and every agent."}
            </span>
            <button
              type="button"
              className="btn teal sm"
              onClick={save}
              disabled={pending || !dirty}
            >
              <Save size={13} /> {isFilled && !dirty ? "Saved" : "Save section"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The standard grant-ready document set (R2-4 / #37). Shared spec module so both
// the server (studio generation + jobs worker) and the client (the Settings
// panel) import the SAME definitions and never drift. Plain module: no "use
// server", so the consts/types can be imported into a client component.

export type GrantDocKind = "org_profile" | "program_budget" | "impact_onepager" | "board_sheet";

export type GrantDocSpec = {
  kind: GrantDocKind;
  title: string;       // human title shown in the panel + used as the doc title
  prompt: string;      // what we ask the Studio to produce
  recallSeed: string;  // query for recall() so the right org facts surface
};

// The four documents funders repeatedly require. Generated from the org brain
// (the grant-readiness onboarding) using the Studio composition + branded shell.
export const GRANT_DOC_SPECS: GrantDocSpec[] = [
  {
    kind: "org_profile",
    title: "Organization profile and capability statement",
    recallSeed: "legal registration EIN status mission programs impact funders board capability",
    prompt:
      "A one to two page organization profile and capability statement for grant applications. Include: who we are and our mission, legal registration and 501(c)(3)/EIN status, year founded and where we are incorporated, the programs we run, the populations and geographies we serve, our track record and credibility (TechSoup verified, sister brands), our leadership in brief, and a short closing on why funders can trust us to steward a grant. Use clear section headings. Use only facts present in the org context; if a specific detail is genuinely missing, write the sentence without it rather than inventing it. Never leave a bracketed placeholder.",
  },
  {
    kind: "program_budget",
    title: "Standard program budget",
    recallSeed: "annual budget revenue expenses funding sources fiscal year programs costs",
    prompt:
      "A standard program budget that a funder would accept as a template. Produce a clean budget table with line-item categories (for example: program staff and field team, child education and school fees, nutrition and meals, Safe House operations, rescue and care, administration, monitoring and reporting) with columns for the category, a short note, and an amount. Use an illustrative total based on the annual budget in the org context if one is given. If no figures are given, write the word TBD in the amount column and a TBD total line, and add a short note that final figures are confirmed per application. Add a brief paragraph above the table explaining the budget basis. Never invent precise dollar figures that are not in the org context, and never use a bracketed placeholder.",
  },
  {
    kind: "impact_onepager",
    title: "Impact summary one-pager",
    recallSeed: "impact beneficiaries served outcomes metrics programs geographies stories results",
    prompt:
      "A one-page impact summary suitable to attach to a grant application or share with a funder. Lead with a short mission line, then the headline reach (beneficiaries served, programs, geographies), then key outcomes as a short bulleted list or small table of indicators, then a brief plain-language note on how outcomes are tracked, and close with one forward-looking line. Use only impact numbers present in the org context; if a number is not given, describe the outcome in words without a figure and never fabricate statistics. Never leave a bracketed placeholder.",
  },
  {
    kind: "board_sheet",
    title: "Board and leadership sheet",
    recallSeed: "board members directors key staff founder bio leadership governance",
    prompt:
      "A board and leadership sheet that funders request to confirm governance. List board members (name and role), then key staff (name and role), then a short founder bio. Present the board and staff as a clean table where possible. Use only the people and details present in the org context; if a name or role is not provided, list only the people you do have rather than inventing a person, and never leave a bracketed placeholder.",
  },
];

export function grantDocSpec(kind: string): GrantDocSpec | undefined {
  return GRANT_DOC_SPECS.find((s) => s.kind === kind);
}

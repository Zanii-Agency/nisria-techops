// FALSE-CANNOT guard.
//
// The Honesty law polices false CAN claims: never say "sent" unless it sent. The
// mirror failure is not policed and is just as costly. On 2026-07-20 Sasa told Nur,
// twice and emphatically, "I genuinely cannot create or export PDF files from this
// line. That capability does not exist here yet." create_letterhead_doc was in its
// offered tool set at that moment, is advertised as delivering "a branded PDF with the
// logo, brand colours, and date", and htmlToPdf is really implemented. Nur now believes
// the system cannot do something it does. A capability nobody asks for dies quietly.
//
// The codebase already fights this with hand-written strings scattered through tool
// descriptions ("You CAN look this up, do not say you have no number", "You DO have
// this memory", "never to claim you cannot file"). Four regexes where an invariant
// belongs. This checks the CLAIM against the tools that were ACTUALLY OFFERED in the
// turn, so it keeps working for tools nobody thought to annotate.
//
// Pure + no imports -> unit-testable under plain node.

// Ways a model denies a capability. Deliberately narrow: we want assertions about what
// the SYSTEM can do, not ordinary refusals ("I won't send that without your ok") and
// not failure reports ("I could not reach the server just now").
const DENIAL = new RegExp(
  "\\b(" +
  // the adverb slot has to cover BOTH spellings: the live line was "I genuinely cannot"
  "i (?:genuinely |really |truly |honestly )?(?:can(?:'|’)?t|cannot)\\b|" +
  "i am (?:not )?(?:un)?able to\\b|i'?m not able to\\b|" +
  "that(?:'|’)?s not something i can\\b|not something i can do\\b|" +
  "(?:that|this) capability (?:does not|doesn'?t) exist\\b|" +
  "i (?:do not|don'?t) have the (?:ability|capability|tools?)\\b|" +
  "(?:is|are) not (?:something|a thing) i can\\b" +
  ")", "i");

// A denial is only FALSE if it is about something a tool in hand could have done.
// Each topic names the tools that would have satisfied it.
const TOPICS = [
  { topic: "pdf/document", re: /\bpdf\b|letterhead|export (?:a |the )?(?:file|doc)|formatted document|proper document|document template/i,
    tools: ["create_letterhead_doc", "project_expense_report", "save_document", "create_doc"] },
  { topic: "send a message", re: /\bsend (?:a )?(?:message|whatsapp|text)\b|message (?:them|him|her)\b|reach (?:them|him|her) directly/i,
    tools: ["send_whatsapp", "message_person", "send_resource"] },
  { topic: "look up a contact", re: /\b(?:phone )?number\b|contact details|how to reach/i,
    tools: ["lookup_contact", "team_detail"] },
  { topic: "recall past conversation", re: /\bremember\b|\brecall\b|past conversation|what (?:we|you) (?:said|discussed)/i,
    tools: ["search_history", "query_memory", "list_learned"] },
  { topic: "bot access / roster", re: /bot access|who (?:has|is) enabled|roster/i,
    tools: ["team_detail", "set_bot_access", "list_team"] },
  { topic: "finance figures", re: /\bexpense|\bspend\b|how much (?:did|was|we)|ledger|payments?\b/i,
    tools: ["project_expenses", "project_expense_report", "finance_summary", "day_report"] },
];

/**
 * detectFalseCannot(reply, availableTools)
 *
 * Returns null when the reply is fine, otherwise
 *   { topic, denial, couldHaveUsed: [...] }
 *
 * availableTools is what the specialist was OFFERED this turn, not what it ran.
 */
export function detectFalseCannot(reply, availableTools = []) {
  const text = String(reply || "");
  const m = DENIAL.exec(text);
  if (!m) return null;
  const have = new Set(availableTools);

  // Only inspect the sentence the denial sits in. A denial about one thing must not be
  // matched against a topic mentioned three paragraphs later.
  const start = text.lastIndexOf(".", m.index) + 1;
  const endDot = text.indexOf(".", m.index + m[0].length);
  const sentence = text.slice(start, endDot === -1 ? text.length : endDot + 1);

  for (const { topic, re, tools } of TOPICS) {
    if (!re.test(sentence)) continue;
    const couldHaveUsed = tools.filter((t) => have.has(t));
    if (couldHaveUsed.length) {
      return { topic, denial: m[0].trim(), sentence: sentence.trim().slice(0, 200), couldHaveUsed };
    }
  }
  return null;
}

// ---- self-check -------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith("false-cannot.mjs")) {
  const T = ["create_letterhead_doc", "lookup_contact", "project_expenses"];

  // the live incident
  const live = "I hear you, and I want to be straight with you. I genuinely cannot create or export PDF files from this line. That capability does not exist here yet.";
  const hit = detectFalseCannot(live, T);
  if (!hit || hit.topic !== "pdf/document") throw new Error("missed the live PDF denial");
  if (!hit.couldHaveUsed.includes("create_letterhead_doc")) throw new Error("did not name the tool it had");

  // same denial, tool genuinely absent -> NOT a false cannot
  if (detectFalseCannot(live, ["lookup_contact"])) throw new Error("flagged a denial with no tool in hand");

  // an ordinary refusal is not a capability denial
  if (detectFalseCannot("I won't send that until you confirm.", T)) throw new Error("flagged a policy refusal");

  // a transient failure report is not a capability denial
  if (detectFalseCannot("I could not attach the PDF just now, the upload failed.", T)) throw new Error("flagged a transient failure");

  // scoping: denial about one topic must not borrow a topic from a later sentence
  const mixed = "I can't reach the server. Separately, here is the PDF you asked for.";
  if (detectFalseCannot(mixed, T)) throw new Error("matched across sentence boundaries");

  // the roster case from the same incident
  const roster = "I can see the full roster, but I cannot tell you who specifically has bot access.";
  const r2 = detectFalseCannot(roster, ["team_detail"]);
  if (!r2 || r2.topic !== "bot access / roster") throw new Error("missed the bot access denial");

  // curly apostrophe and "can’t"
  if (!detectFalseCannot("I can’t export a PDF for you.", T)) throw new Error("missed curly apostrophe form");

  console.log("false-cannot selftest OK");
}

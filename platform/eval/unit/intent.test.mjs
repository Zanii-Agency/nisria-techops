// Unit test grid for isReadIntent (lib/intent.mjs). Pure function, no
// network — runs in milliseconds. Pin every classification so a future regex
// edit can't silently flip a verdict.
//
// Run: node eval/unit/intent.test.mjs

import { isReadIntent } from "../../lib/intent.mjs";

const CASES = [
  // Plain questions
  { cmd: "What's been shared in the Finances group recently?", want: true, note: "ends with ? + opens with what" },
  { cmd: "What's been shared in the Finances group recently? Any payments or receipts logged?", want: true, note: "the E11 prompt: write-verbs inside a question" },
  { cmd: "Where in the portal can I see all my open tasks?", want: true, note: "where + ?" },
  { cmd: "Did I log that payment yet?", want: true, note: "did you + log + ?" },
  { cmd: "Have you sent the invoice to Mark?", want: true, note: "have you + sent + ?" },
  { cmd: "How much have we paid Dorcas this month?", want: true, note: "how much + paid + ?" },
  { cmd: "Any payments logged?", want: true, note: "any + logged + ?" },
  { cmd: "Is there a record of the May rent?", want: true, note: "is there + ?" },
  { cmd: "Can you find the lease?", want: true, note: "can you + find + ?" },

  // Read imperatives (added in v1.3.11.6 to QUESTION_SHAPE_RE)
  { cmd: "Show me the open tasks", want: true, note: "show me, no question mark" },
  { cmd: "List the donations this week", want: true, note: "list, no ?" },
  { cmd: "Find the I&M Bank mandate document", want: true, note: "find, no ?" },
  { cmd: "Tell me what's on for tomorrow", want: true, note: "tell me" },
  { cmd: "Pull up the constitution", want: true, note: "pull up — added v1.3.11.6" },
  { cmd: "Get me Mark's phone number", want: true, note: "get me — added v1.3.11.6" },
  { cmd: "Fetch the lease PDF", want: true, note: "fetch — added v1.3.11.6" },
  { cmd: "Grab the latest payroll statement", want: true, note: "grab — added v1.3.11.6" },
  { cmd: "Bring me the donor list", want: true, note: "bring me — added v1.3.11.6" },
  { cmd: "Give me a summary of yesterday", want: true, note: "give me — added v1.3.11.6" },
  { cmd: "Share the agenda for the team meeting", want: true, note: "share — added v1.3.11.6" },

  // Real WRITE commands
  { cmd: "Log a payment of KES 5000 to Mark", want: false, note: "log + amount (write)" },
  { cmd: "Record KES 12,000 to the printer", want: false, note: "record" },
  { cmd: "Add Tournament Test Member to the team", want: false, note: "add" },
  { cmd: "I paid Mark 30,000 yesterday", want: false, note: "I paid" },
  { cmd: "I sent the lease to Mark this morning", want: false, note: "I sent" },
  { cmd: "Schedule a payment of 25000 rent for the 1st", want: false, note: "schedule + payment" },
  { cmd: "Register a new beneficiary", want: false, note: "register" },
  { cmd: "Stage the food invoice for review", want: false, note: "stage" },

  // Edge cases (intent ambiguous, classification documented)
  { cmd: "", want: true, note: "empty defaults to read (safe rewrite)" },
  { cmd: "   ", want: true, note: "whitespace only defaults to read" },
  { cmd: "Yes", want: true, note: "no write verb, no q-shape → read default (no history)" },
  { cmd: "Confirm", want: true, note: "no write verb, no q-shape → read default" },
  { cmd: "Hey Sasa, what's up?", want: true, note: "ends with ?" },
  { cmd: "Make sure you logged the rent", want: false, note: "no q-shape, write verb 'log' → write (documented miss; acceptable, read rewrite would be confusing)" },

  // v1.3.11.10 (2026-06-15 Nur incident): SEND_INTENT_RE — outbound-comm
  // verbs directed at a third party must classify as SEND, not READ,
  // regardless of whether the input also contains read-imperatives.
  { cmd: "Send Mark the STP report", want: false, note: "send <person> — NOT a read" },
  { cmd: "Send him the lease", want: false, note: "send him" },
  { cmd: "Message Violet about the place hunting", want: false, note: "message <person>" },
  { cmd: "Text them both now", want: false, note: "text them" },
  { cmd: "WhatsApp Cynthia and tell her we paid", want: false, note: "whatsapp <person>" },
  { cmd: "Ping Mark on this", want: false, note: "ping <person>" },
  { cmd: "DM him the bank slip", want: false, note: "dm" },
  { cmd: "Tell Mark about the new place hunting", want: false, note: "tell <person> — SEND, not 'tell me'" },
  { cmd: "Let Violet know the rent is paid", want: false, note: "let <person> know" },
  { cmd: "Remind Cynthia to send the invoice", want: false, note: "remind <person>" },
  { cmd: "Forward the email to Mark", want: false, note: "forward" },
  { cmd: "Reply to him with the figures", want: false, note: "reply" },
  { cmd: "Reach out to Violet today", want: false, note: "reach out" },
  // "tell me" must STILL classify as READ even though SEND_INTENT_RE is
  // checked before QUESTION_SHAPE_RE. Negative-lookahead `(?!me\b)` enforces.
  { cmd: "Tell me what Mark said yesterday", want: true, note: "'tell me' is READ; SEND lookahead excludes 'me'" },
  // "remind me to file ..." — 'file' is a WRITE_INTENT keyword, so this stays
  // WRITE. SEND lookahead correctly skips 'remind me'.
  { cmd: "Remind me to file the STP", want: false, note: "'remind me' bypasses SEND; 'file' makes it WRITE" },
  // "Remind me later" with no write-verb falls back to READ default —
  // task-create routing happens elsewhere and isn't this classifier's concern.
  { cmd: "Remind me later", want: true, note: "'remind me' bypasses SEND, no write verb → READ default" },
];

// v1.3.11.10: context-aware cases. `history` is the recent conversation
// passed to isReadIntent so a short/bare reply after a send-prompt classifies
// as SEND (not READ). Pins the three Nur misfires from 2026-06-15
// (10:13 / 10:22 / 10:28) plus negative cases.
const HISTORY_CASES = [
  {
    label: "10:13 Nur misfire — 'About the new place hunting' after target-elicitation",
    history: [
      { role: "user", content: "Tell Mark something" },
      { role: "assistant", content: "What would you like me to send Mark?" },
    ],
    cmd: "About the new place hunting",
    want: false, // SEND-inherit (short reply after send-prompt) → NOT a read
    note: "5 words, no q-shape, prior turn is target-elicitation for SEND",
  },
  {
    label: "10:22 Nur misfire — 'STP report' after 'Want me to text them both?'",
    history: [
      { role: "assistant", content: "Want me to text them both now?" },
      { role: "user", content: "Yes" },
      { role: "assistant", content: "What would you like me to send them?" },
    ],
    cmd: "STP report",
    want: false,
    note: "2 words after target-elicitation — inherits SEND",
  },
  {
    label: "10:28 Nur misfire — bare 'Yes' after 'Want me to send him a message now?'",
    history: [
      { role: "user", content: "Tell Cynthia about the rent" },
      { role: "assistant", content: "Want me to send him a message now?" },
    ],
    cmd: "Yes",
    want: false,
    note: "BARE_CONFIRM after PRIOR_SEND_PROMPT — SEND-confirm, NOT read",
  },
  {
    label: "negative — 'What did Mark say last week?' after send-prompt still READ",
    history: [
      { role: "assistant", content: "Want me to text Mark now?" },
    ],
    cmd: "What did Mark say last week?",
    want: true,
    note: "ends with ?, opens with 'what' — fresh question wins over inheritance",
  },
  {
    label: "negative — 'Pull up the STP document' is READ even after send-prompt",
    history: [
      { role: "assistant", content: "Want me to text Mark now?" },
    ],
    cmd: "Pull up the STP document",
    want: true,
    note: "explicit READ imperative 'pull up' — fresh READ overrides inheritance",
  },
  {
    label: "negative — 'Send Mark the STP report' classifies as SEND on its own",
    history: [],
    cmd: "Send Mark the STP report",
    want: false,
    note: "SEND_INTENT_RE matches without needing history",
  },
  {
    label: "no-history — bare 'Yes' with no history stays READ (backward-compatible default)",
    history: undefined,
    cmd: "Yes",
    want: true,
    note: "backward-compat: callers that pass no history get the old default",
  },
  {
    label: "no-send-prompt — bare 'Yes' after a READ-prompt still defaults READ",
    history: [
      { role: "assistant", content: "Want me to pull the STP doc for you?" },
    ],
    cmd: "Yes",
    want: true,
    note: "prior turn is READ-prompt ('pull'), not SEND — bare-yes does NOT flip",
  },
  {
    label: "send-prompt — 'send him the lease asap' inherits SEND",
    history: [
      { role: "assistant", content: "Want me to message Mark now?" },
    ],
    cmd: "send him the lease asap",
    want: false,
    note: "explicit send verb in user reply",
  },
];

let pass = 0, fail = 0;
const fails = [];
for (const c of CASES) {
  const got = isReadIntent(c.cmd);
  if (got === c.want) pass++;
  else { fail++; fails.push({ ...c, got }); }
}
for (const c of HISTORY_CASES) {
  const got = isReadIntent(c.cmd, c.history);
  if (got === c.want) pass++;
  else { fail++; fails.push({ cmd: c.cmd, want: c.want, note: `[history] ${c.label}: ${c.note}`, got }); }
}
const TOTAL = CASES.length + HISTORY_CASES.length;
console.log(`\n=== isReadIntent unit grid ===`);
console.log(`  PASS: ${pass} / ${TOTAL}`);
console.log(`  FAIL: ${fail}`);
if (fails.length) {
  console.log(`\nfailed cases:`);
  for (const c of fails) {
    console.log(`  expected ${c.want ? "READ" : "WRITE"} but got ${c.got ? "READ" : "WRITE"}`);
    console.log(`    cmd:  ${JSON.stringify(c.cmd)}`);
    console.log(`    why:  ${c.note}`);
  }
  process.exit(1);
}
process.exit(0);

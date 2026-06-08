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
  { cmd: "Yes", want: true, note: "no write verb, no q-shape → read default" },
  { cmd: "Confirm", want: true, note: "no write verb, no q-shape → read default" },
  { cmd: "Hey Sasa, what's up?", want: true, note: "ends with ?" },
  { cmd: "Make sure you logged the rent", want: false, note: "no q-shape, write verb 'log' → write (documented miss; acceptable, read rewrite would be confusing)" },
];

let pass = 0, fail = 0;
const fails = [];
for (const c of CASES) {
  const got = isReadIntent(c.cmd);
  if (got === c.want) pass++;
  else { fail++; fails.push({ ...c, got }); }
}
console.log(`\n=== isReadIntent unit grid ===`);
console.log(`  PASS: ${pass} / ${CASES.length}`);
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

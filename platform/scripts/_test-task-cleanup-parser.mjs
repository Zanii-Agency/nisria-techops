// Sanity test for the batch-reply parser. Inlines the tested logic from
// lib/task-cleanup.ts (kept in sync manually — parser is small).

function expandNumberList(s) {
  const out = []
  const cleaned = s.replace(/\band\b/gi, ',')
  for (const token of cleaned.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)) {
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      const a = parseInt(range[1], 10), b = parseInt(range[2], 10)
      if (a <= b && a > 0 && b <= 50) for (let i = a; i <= b; i++) out.push(i)
      continue
    }
    const n = parseInt(token, 10)
    if (!isNaN(n) && n > 0 && n <= 50) out.push(n)
  }
  return out
}

function parseBatchReply(text) {
  const t = (text || '').trim()
  if (!t) return { done: [], dropped: [], edits: [], next: false, stop: false, unrecognised: true }
  const lower = t.toLowerCase()
  if (/^(stop|cancel|pause|quit|exit|halt)\b/.test(lower)) return { done: [], dropped: [], edits: [], next: false, stop: true, unrecognised: false }
  if (/^(next|continue|more|go|keep going)\b/.test(lower)) return { done: [], dropped: [], edits: [], next: true, stop: false, unrecognised: false }
  const done = [], dropped = [], edits = []
  const segments = t.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const editMatch = seg.match(/^edit\s+(\d+)\s*[:\-]\s*(.+)$/i)
    if (editMatch) { edits.push({ n: parseInt(editMatch[1], 10), title: editMatch[2].trim() }); continue }
    const doneMatch = seg.match(/^(?:done|did|complete[d]?|finished?|mark\s+done)\s+([0-9,\s\-and]+)$/i)
    if (doneMatch) { done.push(...expandNumberList(doneMatch[1])); continue }
    const dropMatch = seg.match(/^(?:drop|delete|remove|cancel|kill)\s+([0-9,\s\-and]+)$/i)
    if (dropMatch) { dropped.push(...expandNumberList(dropMatch[1])); continue }
  }
  const unrecognised = !done.length && !dropped.length && !edits.length
  return { done, dropped, edits, next: false, stop: false, unrecognised }
}

const cases = [
  ['done 1,3,7; drop 2,5', { done: [1, 3, 7], dropped: [2, 5], edits: [] }],
  ['done 1,3,4', { done: [1, 3, 4], dropped: [], edits: [] }],
  ['drop 2,5', { done: [], dropped: [2, 5], edits: [] }],
  ['edit 4: Send email to Wael instead', { done: [], dropped: [], edits: [{ n: 4, title: 'Send email to Wael instead' }] }],
  ['done 1; drop 2; edit 3: New title', { done: [1], dropped: [2], edits: [{ n: 3, title: 'New title' }] }],
  ['done 1 and 3 and 7', { done: [1, 3, 7], dropped: [], edits: [] }],
  ['done 1-3', { done: [1, 2, 3], dropped: [], edits: [] }],
  ['next', { next: true, stop: false, unrecognised: false }],
  ['stop', { next: false, stop: true, unrecognised: false }],
  ['pause', { next: false, stop: true, unrecognised: false }],
  ['Did 2', { done: [2], dropped: [], edits: [] }],
  ['delete 1,5', { done: [], dropped: [1, 5], edits: [] }],
  ['hello world', { unrecognised: true }],
  ['', { unrecognised: true }],
  // Edge: "done 1,3 drop 2,5" without semicolon should NOT parse cleanly (one segment)
  // (designed behavior: encourage semicolon-separated commands)
  ['done 1,3 drop 2,5', { unrecognised: true }],
]

let pass = 0, fail = 0
for (const [input, expect] of cases) {
  const got = parseBatchReply(input)
  const matchKey = (k) => {
    const e = expect[k], g = got[k]
    if (e === undefined) return true
    if (Array.isArray(e)) return JSON.stringify(e) === JSON.stringify(g)
    return e === g
  }
  const ok = ['done', 'dropped', 'edits', 'next', 'stop', 'unrecognised'].every(matchKey)
  if (ok) { pass++; console.log('  ok :', JSON.stringify(input)) }
  else { fail++; console.log('FAIL :', JSON.stringify(input), '\n     got =', JSON.stringify(got), '\n     exp =', JSON.stringify(expect)) }
}
console.log(`\n${pass}/${pass + fail} passing`)
process.exit(fail ? 1 : 0)

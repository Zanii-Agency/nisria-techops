// Verify each renderer against the mockups Taona approved.

// Node can't import .ts directly; inline the logic for testing.
// Implementations here must stay in sync with lib/format/task-board.ts.

function toRoman(n) {
  const m = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]
  let out = '', x = n
  for (const [v, s] of m) { while (x >= v) { out += s; x -= v } }
  return out
}
function toAlpha(n) {
  let s = '', x = n
  while (x > 0) { x--; s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) }
  return s
}

const tasks = [
  // due today
  { title: 'Send Eunice the venue brief by Friday', due: '2026-06-12', _bucket: 'important_only' },
  // overdue
  { title: 'Fill the Anthropic grant', due: '2026-05-31', _bucket: 'important_urgent', priority: 'high' },
  { title: 'Send proposal to Java', due: '2026-06-04', _bucket: 'neither' },
  { title: 'Contact the PRO', due: '2026-06-09', _bucket: 'neither' },
  // important + urgent
  { title: "Remove Mark's duplicates", _bucket: 'important_urgent' },
  // urgent
  { title: 'Get email access from Nur', _bucket: 'urgent_only' },
  // everything else
  { title: 'Audit CANVA', _bucket: 'neither' },
  { title: 'Create outreach page', _bucket: 'neither' },
]

const today = '2026-06-12'

const SECTION_ORDER = [
  { bucket: 'important_urgent', label: 'Important + urgent' },
  { bucket: 'urgent_only', label: 'Urgent' },
  { bucket: 'important_only', label: 'Important' },
  { bucket: 'neither', label: 'Everything else' },
]
function partition(tasks, today) {
  const due_today = [], overdue = [], byBucket = {}
  for (const t of tasks) {
    const due = t.due ?? null
    if (due && due < today) { overdue.push(t); continue }
    if (due && due === today) { due_today.push(t); continue }
    const b = t._bucket || 'neither'
    ;(byBucket[b] ||= []).push(t)
  }
  const sections = []
  if (due_today.length) sections.push({ label: 'Due today', tasks: due_today })
  if (overdue.length) sections.push({ label: 'Overdue', tasks: overdue })
  for (const { bucket, label } of SECTION_ORDER) {
    const list = byBucket[bucket] || []
    if (list.length) sections.push({ label, tasks: list })
  }
  return sections
}

function line(t) {
  let s = t.title
  if (t.due) s += `, due ${t.due}`
  if (t.priority === 'high') s += ', high'
  return s
}

function renderDecimal(sections) {
  const out = []
  sections.forEach((sec, si) => {
    const n = si + 1
    const c = sec.tasks.length > 1 ? ` (${sec.tasks.length})` : ''
    out.push(`${n}. ${sec.label}${c}`)
    sec.tasks.forEach((t, ti) => out.push(`   ${n}.${ti + 1}  ${line(t)}`))
  })
  return out.join('\n')
}
function renderLegal(sections) {
  const out = []
  sections.forEach((sec, si) => {
    const c = sec.tasks.length > 1 ? ` (${sec.tasks.length})` : ''
    out.push(`${toRoman(si + 1)}.   ${sec.label}${c}`)
    sec.tasks.forEach((t, ti) => out.push(`      ${toAlpha(ti + 1)}.  ${line(t)}`))
  })
  return out.join('\n')
}
function renderBullets(sections) {
  const out = []
  for (const sec of sections) {
    const c = sec.tasks.length > 1 ? ` (${sec.tasks.length})` : ''
    out.push(`• ${sec.label}${c}`)
    for (const t of sec.tasks) out.push(`   ○ ${line(t)}`)
  }
  return out.join('\n')
}
function renderFlat(sections) {
  const out = []
  let n = 1
  for (const sec of sections) {
    for (const t of sec.tasks) {
      const tag = sec.label !== 'Everything else' ? ` — ${sec.label.toLowerCase()}` : ''
      out.push(`${String(n).padStart(2, ' ')}. ${line(t)}${tag}`)
      n++
    }
  }
  return out.join('\n')
}

const sections = partition(tasks, today)

console.log('=== DECIMAL ===')
console.log(renderDecimal(sections))
console.log('\n=== LEGAL ===')
console.log(renderLegal(sections))
console.log('\n=== BULLETS ===')
console.log(renderBullets(sections))
console.log('\n=== FLAT ===')
console.log(renderFlat(sections))

// Picker test cases
function pickStyle(cmd, count) {
  const t = (cmd || '').toLowerCase()
  if (/\b(?:bullets?|bulleted)\b/.test(t)) return 'bullets'
  if (/\b(?:legal|roman|formal|outline\s*format)\b/.test(t)) return 'legal'
  if (/\b(?:flat|simple|short\s*list|one\s*line|just\s*list)\b/.test(t)) return 'flat'
  if (/\b(?:decimal|numbered|categori[zs]ed|structured|hierarch(?:y|ical))\b/.test(t)) return 'decimal'
  if (count <= 5) return 'flat'
  if (/\b(?:summary|overview|brief|sense|glance|quick\s+(?:look|check))\b/.test(t)) return 'bullets'
  if (/\b(?:clean|clear|review|tidy|sort|prune|delete|drop|remove|done|finished?)\b/.test(t)) return 'decimal'
  return 'decimal'
}

const pickerCases = [
  ['show me as bullets', 20, 'bullets'],
  ['use legal format', 20, 'legal'],
  ['just give me a flat list', 20, 'flat'],
  ['give me a quick overview', 20, 'bullets'],
  ['what are my tasks', 20, 'decimal'],
  ['what are my tasks', 3, 'flat'],
  ['let me clean these up', 20, 'decimal'],
  ['drop the dead ones', 20, 'decimal'],
  ['show my tasks numbered', 20, 'decimal'],
  ['summary please', 20, 'bullets'],
  ['can I see them in roman numerals', 20, 'legal'],
]
console.log('\n=== PICKER ===')
let pass = 0, fail = 0
for (const [cmd, count, expected] of pickerCases) {
  const got = pickStyle(cmd, count)
  if (got === expected) { pass++; console.log(`  ok : "${cmd}" (n=${count}) → ${got}`) }
  else { fail++; console.log(`FAIL : "${cmd}" (n=${count}) → ${got}, expected ${expected}`) }
}
console.log(`\n${pass}/${pass + fail} picker cases passing`)

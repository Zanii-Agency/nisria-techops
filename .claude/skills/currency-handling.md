# Skill: Currency Handling

Operational pattern for the Currency Law (Law 2). Reference this skill whenever code touches money values.

## The contract

1. Every money value carries a currency. USD or KES. Never both.
2. The `<Money>` component is the only render path for currency values.
3. Sums happen per-currency. Cross-currency comparisons are explicit and labeled.
4. The current FX rate has a single source (TBD: the org_profile.fx_rates JSONB field, updated weekly).

## The `<Money>` component contract

```tsx
// /platform/components/Money.tsx
import type { Currency } from '@/lib/currency';

export function Money({ value, currency, hidden }: {
  value: number;
  currency: Currency; // 'USD' | 'KES'
  hidden?: boolean;   // honors the money-hide toggle
}) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
  return (
    <span className={`money money-${currency.toLowerCase()}${hidden ? ' money-hidden' : ''}`}>
      {formatted}
    </span>
  );
}
```

## Patterns

### Pattern: Display a single value

```tsx
// Right
<Money value={donation.amount} currency={donation.currency} />

// Wrong
${donation.amount}
{money(donation.amount)}
{donation.amount.toLocaleString()}
```

### Pattern: Sum per-currency

```tsx
// Right
const usdTotal = donations.filter(d => d.currency === 'USD').reduce((s, d) => s + d.amount, 0);
const kesTotal = donations.filter(d => d.currency === 'KES').reduce((s, d) => s + d.amount, 0);

return (
  <div>
    <Money value={usdTotal} currency="USD" /> raised in USD
    <br />
    <Money value={kesTotal} currency="KES" /> raised in KES
  </div>
);

// Wrong
const total = donations.reduce((s, d) => s + d.amount, 0);
return <div>${total}</div>;
```

### Pattern: Blended cross-currency total

When a single number really must span currencies (the org's full raised view, grant utilisation across regions), show the blend with its FX rate visible:

```tsx
const usdFromKes = kesTotal / fxRateKesUsd;
const blendedUsd = usdTotal + usdFromKes;

return (
  <div>
    <Money value={blendedUsd} currency="USD" /> total raised
    <span className="fx-note">
      USD <Money value={usdTotal} currency="USD" /> +
      KES <Money value={kesTotal} currency="KES" /> at {fxRateKesUsd} KES/USD
    </span>
  </div>
);
```

### Pattern: Currency in extraction

When extracting from a source document into staging:

```ts
// extraction_staging row
{
  source_doc_id: doc.id,
  domain: 'finance',
  raw_json: { /* source data */ },
  normalized: {
    amount: parseFloat(amountStr),
    currency: detectCurrency(doc, amountStr), // 'USD' | 'KES', never null
  },
  confidence: 'high', // 'high' | 'medium' | 'low'
  reconciled: doesLineItemSumMatchStatedTotal(doc),
  status: 'pending',
  signature: hash(doc.id, amountStr),
}
```

Currency detection logic:
- Bank statement file path or filename contains "USD" or USD account number → USD
- Bank statement file path or filename contains "KES", "UWEZO", "LHSH" → KES
- Drive monthly expense sheet (Kenya operations) → KES
- Givebutter payout source → USD (donor side), KES (Kenya side after FX bridge)
- Grant award document → currency stated in the document
- If currency cannot be determined: confidence = 'low' and the row stays in staging for operator review

## Audit queries

```sql
-- Detect the failure mode that created the $129 sextillion total
select count(*) from payments
where created_by = 'drive monthly history' and currency = 'USD';
-- Target: 0

-- Detect untagged currency
select count(*) from donations where currency is null or currency = '';
select count(*) from payments where currency is null or currency = '';

-- Detect impossible USD amounts (likely KES read as USD)
select id, amount, currency from donations
where currency = 'USD' and amount > 1000000;

-- Detect impossible KES amounts (likely USD read as KES)
select id, amount, currency from payments
where currency = 'KES' and amount < 100;
```

## Common mistakes

**Mistake.** Adding `<Money>` but forgetting the currency prop.
**Fix.** TypeScript should refuse to compile. If it compiled, the type is wrong.

**Mistake.** Summing across currencies because "they're all just numbers."
**Fix.** They're not. The audit query catches this. The doctrine-reviewer catches this. The platform's reputation depends on this.

**Mistake.** Converting KES to USD silently inside a query, then displaying the result as USD with no FX rate visible.
**Fix.** Conversion always has the rate visible and the source named. See the "Blended" pattern above.

**Mistake.** Using a free-text currency input that lets the operator type "kes" or "Ksh" or "shilling."
**Fix.** Currency is a typed enum (USD or KES). Inputs are dropdowns or radios.

## When this skill applies

Any code that displays, sums, computes, or stores money. Any extraction that assigns a currency. Any API response that includes a money value. Any export to CSV or PDF that includes money. Anywhere Sasa drafts text referring to money.

If you are writing code and money appears, this skill applies.

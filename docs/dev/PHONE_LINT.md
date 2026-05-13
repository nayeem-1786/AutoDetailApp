# Phone Format Lint — `phone/no-raw-display`

Custom ESLint rule that prevents raw phone values from being rendered into JSX
without going through the canonical formatting helpers.

## Why this rule exists

Phase **Normalization-1** locked phone STORAGE to E.164 (`+14245551234`) at
every chokepoint that writes a phone column. Phase **Phone-UX-1** then fixed
35+ DISPLAY and INPUT sites across the app to render that storage as a human
string (`(424) 555-1234`).

Those phases are point-in-time fixes. Without enforcement, new code can easily
slip a raw `{customer.phone}` into a UI surface again — that's how the 28 leaks
Phase Phone-UX-1 had to repair accumulated in the first place.

This rule catches violations at write time, in the editor, before they ship.

## What it flags

The rule fires when a JSX expression renders a phone-suggestive value that is
not wrapped in one of the canonical helpers.

**Phone-suggestive names** (case-insensitive, exact match):

```
phone, phone_number, phoneNumber,
mobile, cell, sms_phone, smsPhone,
to_phone, toPhone, from_phone, fromPhone,
recipient_phone, recipientPhone,
business_phone, businessPhone,
customer_phone, customerPhone
```

**Allowed wrappers** (subtree under any of these is not inspected):

| Helper             | Use when                                      |
| ------------------ | --------------------------------------------- |
| `formatPhone`      | Visible display in admin / customer UI        |
| `phoneToE164`      | `<a href="tel:…">`, JSON-LD, structured data  |
| `normalizePhone`   | Storage normalization (rare in JSX)           |
| `formatPhoneInput` | Live formatting in controlled `<input>`       |

**Patterns the rule walks into**:

- JSX text expressions: `{customer.phone}`
- JSX attribute values: `<span title={customer.phone}>`
- Template literal substitutions inside JSX: `` `tel:${customer.phone}` ``
- Ternary/logical/binary branches: `{showPhone ? customer.phone : '—'}`
- Computed property access: `{row['phone_number']}`
- Bare identifiers: `<span>{phone}</span>`
- TypeScript `as` / non-null assertions: `{(customer.phone as string)}`
- Arguments of NON-allowed function calls inside JSX: `{capitalize(customer.phone)}`

**Patterns it deliberately ignores**:

- Wrapped subtrees — anything inside `formatPhone(…)`, `phoneToE164(…)`,
  `normalizePhone(…)`, or `formatPhoneInput(…)`
- Identifiers/properties whose names are not on the suggestive list
  (`customer.id`, `data.name`, `formattedPhone`)
- Template literals OUTSIDE JSX (`const debug = \`raw=${customer.phone}\``)
  — those are typically normalized or formatted downstream

## How to fix a violation

In almost every case, replace the raw reference with the right helper:

```tsx
// ❌ flagged
<span>{customer.phone}</span>

// ✅ display
<span>{formatPhone(customer.phone)}</span>

// ✅ tel: link / JSON-LD
<a href={`tel:${phoneToE164(customer.phone)}`}>Call</a>

// ✅ controlled input
<input
  value={value}
  onChange={(e) => setValue(formatPhoneInput(e.target.value))}
/>
```

All four helpers live in `src/lib/utils/format.ts`.

## How to opt out

Use the standard ESLint inline disable comment on the line above the
expression:

```tsx
{/* eslint-disable-next-line phone/no-raw-display */}
<pre>{customer.phone}</pre>
```

Reserve this for cases where the raw E.164 string is intentional — admin debug
panels, raw-data exports rendered in a `<pre>`, etc. If you find yourself
reaching for the disable comment in customer- or staff-facing UI, that's a bug
the rule is working as designed to flag.

## Severity

Currently configured as **`warn`** in `eslint.config.mjs`.

It is set to `warn` and not `error` because Phase Phone-UX-1 may still have
in-flight or unresolved leaks — turning the rule to `error` immediately would
break the build for warnings that are not yet fixed in code.

After Phase Phone-UX-1 is verified on production and the warning count is at
zero (or each remaining warning has a justified `eslint-disable-next-line`),
upgrade severity to `error`. The TODO comment in `eslint.config.mjs` marks the
exact line.

## Files

- Rule implementation: `eslint-rules/phone-no-raw-display.js`
- Tests: `eslint-rules/__tests__/phone-no-raw-display.test.js`
- Registered in: `eslint.config.mjs` (under the `phone` plugin namespace)
- Vitest include: `vitest.config.ts` picks up `eslint-rules/__tests__/**`

Run the tests with:

```sh
npx vitest run eslint-rules/__tests__/phone-no-raw-display.test.js
```

Run the lint over the codebase with:

```sh
npm run lint -- src/
```

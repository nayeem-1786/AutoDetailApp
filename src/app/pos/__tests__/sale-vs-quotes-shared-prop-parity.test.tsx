import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * STRUCTURAL GUARD — Sale vs Quotes shared-component prop parity.
 *
 * Track B deliverable (docs/dev/SALE_VS_QUOTES_PARITY_SWEEP.md). This is a
 * CONTRACT test on the panel SOURCE, not a behavior test: Quotes was built as a
 * partial copy of Sale, and four separate audits each found ONE place where the
 * Quotes panel (quote-ticket-panel.tsx) omitted a prop/handler the Sale panel
 * (ticket-panel.tsx) wires on a SHARED component:
 *   - G1 onCustomerTypeChanged (the customer-type pill — silent demotion, #119)
 *   - G2 onEditVehicle + editVehicle (vehicle edit unreachable in Quotes)
 *   - G4 CustomerTypePrompt never mounted in Quotes
 *   - G3 reprice-failure surfaced nowhere in Quotes
 *
 * Rather than re-discover the NEXT such omission in production, this test pins
 * the contract: for every shared component used in both panels, every prop the
 * Sale panel wires must also be wired in the Quotes panel (minus a small,
 * explicitly-documented allowlist of intentional Sale-only props). If someone
 * adds a new callback to Sale's <CustomerVehicleSummary> and forgets Quotes,
 * THIS test fails at CI with the exact missing prop name.
 *
 * Source-parsing (not render-introspection) is deliberate: it covers
 * conditionally-mounted components (which a render harness can't easily reach),
 * is immune to the panels' ~14-child / 4-context dependency churn, and directly
 * expresses the "Quotes ⊇ Sale props" contract. The #119 author reached the same
 * conclusion (a full QuoteTicketPanel render harness is disproportionate).
 */

const SALE_PANEL = 'src/app/pos/components/ticket-panel.tsx';
const QUOTE_PANEL = 'src/app/pos/components/quotes/quote-ticket-panel.tsx';

const saleSrc = readFileSync(join(process.cwd(), SALE_PANEL), 'utf8');
const quoteSrc = readFileSync(join(process.cwd(), QUOTE_PANEL), 'utf8');

// Components mounted in BOTH panels (sweep Target 1).
const SHARED_COMPONENTS = [
  'CustomerVehicleSummary',
  'CustomerLookup',
  'CustomerCreateDialog',
  'VehicleSelector',
  'VehicleCreateDialog',
  'PrerequisiteRemovalDialog',
  'ManagerPinDialog',
] as const;

// Props the Sale panel wires that Quotes intentionally omits. Each entry MUST
// carry a reason — adding to this list is the sanctioned way to record a
// deliberate divergence (and silence the guard for that prop).
const INTENTIONAL_SALE_ONLY: Record<string, { prop: string; why: string }[]> = {
  // Quotes have no checkout/payment path, so there is nothing to disable the
  // change/edit-vehicle buttons against (sweep Target 2, Informational).
  CustomerVehicleSummary: [{ prop: 'disabled', why: 'quotes have no checkout/payment path' }],
};

/**
 * Extract the opening-tag substring for `<ComponentName ... >` (or `/>`),
 * tracking brace/paren depth so `>` inside arrow functions or `={...}` values
 * does not prematurely end the tag. Throws if the component is not mounted.
 */
function extractOpeningTag(source: string, componentName: string): string {
  const m = new RegExp(`<${componentName}[\\s/>]`).exec(source);
  if (!m) {
    throw new Error(`<${componentName}> is not mounted in the panel source`);
  }
  let i = m.index + componentName.length + 1;
  let depth = 0;
  let tag = '';
  while (i < source.length) {
    const ch = source[i];
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
    else if (ch === '>' && depth === 0) break;
    tag += ch;
    i++;
  }
  return tag;
}

/**
 * Prop names = identifiers immediately followed by `=` at brace/paren depth 0
 * within the opening tag. (Boolean props without `=` are not used on these
 * mounts; values, arrow-fn bodies, and nested calls live at depth > 0.)
 */
function extractProps(tag: string): Set<string> {
  const props = new Set<string>();
  let depth = 0;
  let ident = '';
  for (let i = 0; i < tag.length; i++) {
    const ch = tag[i];
    if (ch === '{' || ch === '(') { depth++; ident = ''; continue; }
    if (ch === '}' || ch === ')') { depth--; ident = ''; continue; }
    if (depth === 0) {
      if (/[A-Za-z0-9_]/.test(ch)) ident += ch;
      else if (ch === '=') { if (ident) props.add(ident); ident = ''; }
      else ident = '';
    }
  }
  return props;
}

describe('Sale vs Quotes — shared-component prop parity (structural guard)', () => {
  it('sanity: both panel sources are readable and non-trivial', () => {
    expect(saleSrc.length).toBeGreaterThan(1000);
    expect(quoteSrc.length).toBeGreaterThan(1000);
  });

  for (const comp of SHARED_COMPONENTS) {
    it(`${comp}: every prop Sale wires is also wired in Quotes`, () => {
      const saleProps = extractProps(extractOpeningTag(saleSrc, comp));
      const quoteProps = extractProps(extractOpeningTag(quoteSrc, comp));

      // Self-check: parsing produced a plausible prop set.
      expect(saleProps.size, `parsed no props for Sale <${comp}> — parser regression?`).toBeGreaterThan(0);

      const allow = new Set((INTENTIONAL_SALE_ONLY[comp] ?? []).map((e) => e.prop));
      const missing = [...saleProps].filter((p) => !quoteProps.has(p) && !allow.has(p));

      expect(
        missing,
        `Quotes <${comp}> (quote-ticket-panel.tsx) is missing prop(s) Sale wires: [${missing.join(
          ', '
        )}]. Wire them to match Sale, or — if the omission is deliberate — add each to ` +
          `INTENTIONAL_SALE_ONLY['${comp}'] with a reason.`
      ).toEqual([]);
    });
  }
});

describe('Sale vs Quotes — customer-type capture parity (G4)', () => {
  it('CustomerTypePrompt is mounted in BOTH panels', () => {
    // The prompt classifies an unknown-type customer on attach. It was Sale-only
    // until Track B; this pins it present in both so it cannot silently regress.
    expect(/<CustomerTypePrompt[\s/>]/.test(saleSrc), 'Sale panel must mount <CustomerTypePrompt>').toBe(true);
    expect(/<CustomerTypePrompt[\s/>]/.test(quoteSrc), 'Quotes panel must mount <CustomerTypePrompt>').toBe(true);
  });
});

describe('Sale vs Quotes — reprice-failure surfacing parity (G3)', () => {
  it('both panels surface the repriceFailed flag (vehicle-change reprice toast)', () => {
    // quote-reducer/ticket-reducer both set item.repriceFailed on a no-tier
    // vehicle change; both panels must read it to warn the operator rather than
    // silently keep a stale price. Pins the toast effect present in both.
    expect(saleSrc.includes('repriceFailed'), 'Sale panel must surface repriceFailed').toBe(true);
    expect(quoteSrc.includes('repriceFailed'), 'Quotes panel must surface repriceFailed').toBe(true);
  });
});

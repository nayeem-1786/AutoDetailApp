import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import rule from '../phone-no-raw-display.js';

// RuleTester uses mocha-style globals; bridge them to vitest.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
});

tester.run('phone/no-raw-display', rule, {
  valid: [
    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1: original valid cases
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'wrapped in formatPhone',
      code: `const C = ({ customer }) => <span>{formatPhone(customer.phone)}</span>;`,
    },
    {
      name: 'tel: href via phoneToE164 in template literal',
      code: `const C = ({ customer }) => <a href={\`tel:\${phoneToE164(customer.phone)}\`}>Call</a>;`,
    },
    {
      name: 'live input formatter',
      code: `const C = () => <input onChange={(e) => formatPhoneInput(e.target.value)} />;`,
    },
    {
      name: 'non-phone field (name) is fine',
      code: `const C = ({ customer }) => <p>{customer.name}</p>;`,
    },
    {
      name: 'non-phone field (total) is fine',
      code: `const C = ({ order }) => <p>{order.total}</p>;`,
    },
    {
      name: 'variable whose name contains "phone" but is not an exact phone token',
      code: `const C = ({ formattedPhone }) => <span>{formattedPhone}</span>;`,
    },
    {
      name: 'normalizePhone wrapper allowed',
      code: `const C = ({ input }) => <span>{normalizePhone(input)}</span>;`,
    },
    {
      name: 'formatPhone via namespace.method',
      code: `const C = ({ user }) => <span>{utils.formatPhone(user.phoneNumber)}</span>;`,
    },
    {
      // RuleTester registers the rule under a prefixed namespace
      // (rule-to-test/<name>) instead of the configured plugin/name. We test
      // the disable mechanism using that internal name; in real source the
      // user writes // eslint-disable-next-line phone/no-raw-display .
      name: 'inline disable comment opts the line out',
      code: `const C = ({ customer }) => (
        <span>
          {/* eslint-disable-next-line rule-to-test/phone/no-raw-display */}
          {customer.phone}
        </span>
      );`,
    },
    {
      name: 'phone reference inside non-JSX template literal is not flagged',
      code: `const C = ({ customer }) => {
        const debug = \`raw=\${customer.phone}\`;
        return <span>{formatPhone(customer.phone)}</span>;
      };`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1.3 (LOCKED-3): boolean / ternary test position
    // The left side of `&&`/`||` and the test of `? :` are not visibly
    // displayed — skip them.
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'truthy guard for conditional render (customer.phone && jsx)',
      code: `const C = ({ customer }) => <span>{customer.phone && <a href="tel:1">Call</a>}</span>;`,
    },
    {
      name: 'negated truthy guard (!customer.phone &&)',
      code: `const C = ({ customer }) => <span>{!customer.phone && <em>No phone</em>}</span>;`,
    },
    {
      name: 'logical OR fallback as test position',
      code: `const C = ({ customer }) => <span>{customer.phone || 'No phone'}</span>;`,
    },
    {
      name: 'ternary test position with wrapped branches',
      code: `const C = ({ customer }) => <span>{customer.phone ? formatPhone(customer.phone) : '—'}</span>;`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1.3 (LOCKED-4): formatPhone(x) || x fallback
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'formatPhone(x) || x canonical fallback',
      code: `const C = ({ customer }) => <span>{formatPhone(customer.phone) || customer.phone}</span>;`,
    },
    {
      name: 'formatPhone(x) || dash placeholder',
      code: `const C = ({ c }) => <span>{formatPhone(c.phone) || '—'}</span>;`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1.3 (LOCKED-5): JSX key attribute skipped
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'phone used as React key (not visible)',
      code: `const C = ({ phones }) => <ul>{phones.map((phone) => <li key={phone}>{formatPhone(phone)}</li>)}</ul>;`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1.3 (LOCKED-6): input value binding skipped
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'native <input value={phone}> binding skipped',
      code: `const C = ({ phone, setPhone }) => <input value={phone} onChange={(e) => setPhone(e.target.value)} />;`,
    },
    {
      name: '<Input value={phone}> binding skipped (shadcn wrapper)',
      code: `const C = ({ phone, setPhone }) => <Input value={phone} onChange={(e) => setPhone(e.target.value)} />;`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1.3 (LOCKED-7): cell/mobile generics removed
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'TanStack table cell.getValue() is not a phone',
      code: `const C = ({ cell }) => <span>{cell.getValue()}</span>;`,
    },
    {
      name: 'mobile-fee data structure (quote.mobile.zone)',
      code: `const C = ({ quote }) => <span>{quote.mobile.zone}</span>;`,
    },
    {
      name: 'bare cell identifier no longer flagged',
      code: `const C = ({ cell }) => <span>{cell}</span>;`,
    },
  ],

  invalid: [
    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1: original invalid cases (still flagged)
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'raw customer.phone in JSX text',
      code: `const C = ({ customer }) => <span>{customer.phone}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'raw customer.phone next to JSX text content',
      code: `const C = ({ customer }) => <p>Call {customer.phone}</p>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'raw user.phoneNumber',
      code: `const C = ({ user }) => <span>{user.phoneNumber}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phoneNumber' } }],
    },
    {
      name: 'snake_case business_phone',
      code: `const C = ({ data }) => <p>{data.business_phone}</p>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'business_phone' } }],
    },
    {
      name: 'bare phone identifier',
      code: `const C = ({ phone }) => <span>{phone}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'computed property access (non-input context)',
      code: `const C = ({ row }) => <span>{row['phone_number']}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone_number' } }],
    },
    {
      name: 'JSX attribute (tooltip-style) — flagged, opt-out available',
      code: `const C = ({ customer }) => <span title={customer.phone}>contact</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'ternary CONSEQUENT branch leaks raw phone',
      code: `const C = ({ showPhone, customer }) => <span>{showPhone ? customer.phone : '—'}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'template literal substitution in JSX',
      code: `const C = ({ customer }) => <a href={\`tel:\${customer.phone}\`}>Call</a>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'TS as-cast does not hide the leak',
      code: `const C = ({ customer }: { customer: { phone: string } }) => <span>{(customer.phone as string)}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'raw phone passed into a non-allowed call inside JSX',
      code: `const C = ({ customer }) => <span>{capitalize(customer.phone)}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1.3 (LOCKED-4): negative — not formatPhone or
    // wrong-order fallback still leaks
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'wrong-order fallback (raw on left of formatPhone)',
      code: `const C = ({ customer }) => <span>{customer.phone || formatPhone(customer.phone)}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'non-formatPhone helper on left of || does not exempt right side',
      code: `const C = ({ customer }) => <span>{otherFormat(customer.phone) || customer.phone}</span>;`,
      // Both sides flagged: left wraps with a non-allowed helper, right is raw.
      errors: [
        { messageId: 'rawPhone', data: { name: 'phone' } },
        { messageId: 'rawPhone', data: { name: 'phone' } },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1.3 (LOCKED-6): negative — non-input element with
    // value attribute still inspected
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'non-input element with value attribute is still flagged',
      code: `const C = ({ phone }) => <span value={phone}>x</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase Lint-Hardening-1.3 (LOCKED-7): compound forms still flagged
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'compound cell_phone still flagged',
      code: `const C = ({ customer }) => <span>{customer.cell_phone}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'cell_phone' } }],
    },
    {
      name: 'compound mobilePhone still flagged',
      code: `const C = ({ user }) => <span>{user.mobilePhone}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'mobilePhone' } }],
    },
  ],
});

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
  ],

  invalid: [
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
      name: 'employee.cell',
      code: `const C = ({ employee }) => <p>{employee.cell}</p>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'cell' } }],
    },
    {
      name: 'bare phone identifier',
      code: `const C = ({ phone }) => <span>{phone}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'computed property access',
      code: `const C = ({ row }) => <input value={row['phone_number']} readOnly />;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone_number' } }],
    },
    {
      name: 'JSX attribute (tooltip-style) — flagged, opt-out available',
      code: `const C = ({ customer }) => <span title={customer.phone}>contact</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'ternary branch leaks raw phone',
      code: `const C = ({ showPhone, customer }) => <span>{showPhone ? customer.phone : '—'}</span>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'template literal substitution in JSX',
      code: `const C = ({ customer }) => <a href={\`tel:\${customer.phone}\`}>Call</a>;`,
      errors: [{ messageId: 'rawPhone', data: { name: 'phone' } }],
    },
    {
      name: 'logical fallback (raw on left)',
      code: `const C = ({ customer }) => <span>{customer.phone || 'N/A'}</span>;`,
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
  ],
});

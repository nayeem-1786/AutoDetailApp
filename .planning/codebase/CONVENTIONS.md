# Coding Conventions

**Analysis Date:** 2026-02-16

## Naming Patterns

**Files:**
- Pages: kebab-case with route-based structure (`new/page.tsx`, `[id]/page.tsx`)
- Components: kebab-case (`customer-stats.tsx`, `zone-picker.tsx`)
- Utilities: kebab-case (`admin-fetch.ts`, `phone-validation.ts`)
- API routes: `route.ts` in directory structure (`api/admin/customers/route.ts`)

**Functions:**
- React components: PascalCase (`NewCustomerPage`, `CustomerStats`)
- Utility functions: camelCase (`formatCurrency`, `normalizePhone`, `hasPermission`)
- API route handlers: named exports with HTTP method (`export async function GET()`, `export async function POST()`)
- React hooks: camelCase with `use` prefix (`usePosAuth`, `useBusinessInfo`, `useAddonSuggestions`)

**Variables:**
- Constants: SCREAMING_SNAKE_CASE (`TAX_RATE`, `SITE_URL`, `APPOINTMENT`)
- Local variables: camelCase (`customerType`, `phonePreview`, `slotInterval`)
- Component props: camelCase (`customerId`, `isEditable`, `onSave`)
- State variables: camelCase (`saving`, `loading`, `selectedVehicle`)

**Types:**
- Interfaces: PascalCase (`Employee`, `Customer`, `VehicleSizeClass`)
- Type aliases: PascalCase (`UserRole`, `AppointmentStatus`)
- Union types: PascalCase (`'draft' | 'active' | 'disabled'`)
- Enums: Not used (prefer union types and const objects)

## Code Style

**Formatting:**
- Tool: Built-in Next.js ESLint config (`eslint-config-next`)
- Config file: `eslint.config.mjs`
- Key settings: TypeScript strict mode, React JSX transform

**Linting:**
- Tool: ESLint with Next.js presets
- Rules: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Ignored: `.next/`, `out/`, `build/`, `next-env.d.ts`

**TypeScript:**
- Strict mode: enabled
- Target: ES2017
- Module resolution: bundler
- Path aliases: `@/*` maps to `./src/*`

## Import Organization

**Order:**
1. React/Next.js core (`'use client'` directive first, then React imports, then Next.js)
2. Third-party packages (`zod`, `sonner`, `lucide-react`, etc.)
3. Internal aliases by category:
   - Type imports (`@/lib/supabase/types`)
   - Supabase clients (`@/lib/supabase/client`, `@/lib/supabase/admin`)
   - Utilities (`@/lib/utils/*`)
   - Data functions (`@/lib/data/*`)
   - Components (`@/components/*`)
   - Hooks (`@/lib/hooks/*`, `@/app/pos/hooks/*`)

**Path Aliases:**
- `@/*` resolves to `src/*`
- Always use aliases, never relative imports across feature boundaries
- Within same feature: relative imports acceptable (`./components/customer-stats`)

**Examples:**
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { customerCreateSchema, type CustomerCreateInput } from '@/lib/utils/validation';
import { normalizePhone, formatPhone } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
```

## Error Handling

**Patterns:**
- Try-catch blocks: Used extensively (669 occurrences across codebase)
- API routes: Always wrap in try-catch, return `NextResponse.json({ error })` with proper status codes
- Client components: Use try-catch with `toast.error()` for user feedback
- Async operations: Always handle rejection, never leave dangling promises

**API Error Response Pattern:**
```typescript
export async function POST(request: NextRequest) {
  try {
    // Validation
    if (!param) {
      return NextResponse.json(
        { error: 'Missing required parameter' },
        { status: 400 }
      );
    }

    // Business logic
    const result = await doSomething();

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Operation failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Client Error Pattern:**
```typescript
async function onSubmit(data: FormInput) {
  setSaving(true);
  try {
    const { data: result, error } = await supabase
      .from('table')
      .insert(data);

    if (error) throw error;

    toast.success('Success message');
    router.push('/destination');
  } catch (error) {
    console.error('Error:', error);
    toast.error('User-friendly error message');
  } finally {
    setSaving(false);
  }
}
```

## Logging

**Framework:** Native `console` methods (no external logging library)

**Patterns:**
- Use `console.error()` for error logging with context
- Use `console.log()` sparingly for debugging (production logs kept minimal)
- API routes: Log errors with operation context (`console.error('Quote send failed:', error)`)
- Structured logging: Include relevant IDs and data (`console.error('Job creation failed for customer', customerId, error)`)

**When to Log:**
- All caught exceptions in API routes
- Background operations (fire-and-forget hooks, cron jobs)
- External API failures (Twilio, Stripe, QBO, etc.)
- Permission denial events
- Critical data operations (soft deletes, status transitions)

**When NOT to Log:**
- Validation failures (return error response directly)
- Expected empty results
- User-triggered actions that show UI feedback

## Comments

**When to Comment:**
- Complex business logic that's non-obvious
- Workarounds for external library quirks
- Permission checks and security-sensitive code
- Temporal logic (PST timezone calculations, date handling)
- Magic numbers requiring explanation

**JSDoc/TSDoc:**
- Not systematically used
- Inline comments preferred over JSDoc blocks
- Type definitions provide self-documentation

**Comment Style Examples:**
```typescript
// Super-Admin always has full access
if (role === 'super_admin') return true;

// Parse the date to get day-of-week
const dateObj = new Date(dateStr + 'T12:00:00');

// Handle double-serialized JSON (string instead of object)
const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;

// Permission resolution order:
// 1. User-level override (employee_id set) → highest priority
// 2. Role-level default (role set) → fallback
// 3. Deny → if no matching permission found
```

## Function Design

**Size:**
- Small, focused functions preferred
- Complex pages may have large event handlers (100+ lines acceptable for form submissions with multi-step logic)
- Utility functions: typically 10-40 lines
- Extract reusable logic into separate utility files

**Parameters:**
- Named parameters via destructuring for 3+ params
- Optional params use TypeScript optional syntax (`param?:`)
- Default values in function signature

**Return Values:**
- Explicit return types for public APIs and utilities
- API routes: Always return `NextResponse`
- Supabase queries: Return destructured `{ data, error }`
- Utilities: Return typed values, use `null` for failure (not `undefined`)

**Examples:**
```typescript
// Utility with explicit return type
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  // ...
  return digits.length === 11 && digits.startsWith('1') ? `+${digits}` : null;
}

// Hook with destructured return
export function useAddonSuggestions() {
  const [suggestions, setSuggestions] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(false);
  return { suggestions, loading };
}
```

## Module Design

**Exports:**
- Named exports preferred over default exports (except for Next.js pages/layouts)
- Multiple exports per file acceptable for related utilities
- Barrel files not used (direct imports preferred)

**File Organization:**
```
src/
├── app/                          # Next.js app router pages
├── components/
│   ├── ui/                       # Reusable UI primitives
│   ├── public/                   # Public-facing components
│   └── account/                  # Customer portal components
├── lib/
│   ├── supabase/                 # Database clients
│   ├── utils/                    # Pure utility functions
│   ├── data/                     # Data access layer
│   ├── auth/                     # Authentication helpers
│   ├── hooks/                    # Shared React hooks
│   ├── pos/                      # POS-specific logic
│   └── services/                 # Business logic services
```

**Pattern:**
- API routes live next to their page routes (`app/api/...`)
- Component-specific utilities in same directory (`./quote-helpers.ts`)
- Shared utilities in `lib/utils/`
- Type definitions centralized in `lib/supabase/types.ts`

---

*Convention analysis: 2026-02-16*

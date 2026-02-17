# Testing Patterns

**Analysis Date:** 2026-02-16

## Test Framework

**Runner:**
- None configured (no test framework installed)
- Dependencies: No `jest`, `vitest`, `@testing-library`, or similar packages in `package.json`

**Assertion Library:**
- Not applicable

**Run Commands:**
```bash
# No test scripts defined in package.json
npm run test          # Not available
npm run test:watch    # Not available
npm run test:coverage # Not available
```

## Test File Organization

**Location:**
- No test files present in codebase

**Naming:**
- Not applicable (no tests exist)

**Structure:**
- Not applicable

## Test Structure

**Suite Organization:**
- Not applicable (no test framework configured)

**Patterns:**
- Testing is performed manually through UI interaction
- Type safety enforced via TypeScript strict mode
- Runtime validation via Zod schemas at API boundaries

**Quality Assurance Approach:**
- TypeScript compilation catches type errors
- ESLint catches code quality issues
- Manual QA on development and staging environments
- Production monitoring for runtime errors

## Mocking

**Framework:**
- Not applicable

**Patterns:**
- Not applicable

**What to Mock:**
- Not applicable

**What NOT to Mock:**
- Not applicable

## Fixtures and Factories

**Test Data:**
- Not applicable (no test files exist)

**Location:**
- Not applicable

## Coverage

**Requirements:**
- No code coverage tooling configured
- No coverage targets enforced

**View Coverage:**
```bash
# Not available
```

## Test Types

**Unit Tests:**
- Not implemented
- Type safety serves as lightweight unit test (compilation = passing type tests)

**Integration Tests:**
- Not implemented
- Manual integration testing performed against live Supabase database

**E2E Tests:**
- Not implemented
- Manual end-to-end testing via browser and mobile devices
- Production monitoring catches regressions

## Common Patterns

**Validation Testing:**
- Zod schemas provide runtime validation at API boundaries
- Example pattern from codebase:
```typescript
import { z } from 'zod';

const customerCreateSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  // ...
});

// Used in API routes and forms
const result = customerCreateSchema.safeParse(data);
if (!result.success) {
  return NextResponse.json(
    { error: result.error.errors },
    { status: 400 }
  );
}
```

**Type Safety as Testing:**
- Extensive TypeScript interfaces for database entities (`Employee`, `Customer`, `Transaction`, etc.)
- Union types for status enums prevent invalid states
- Strict null checks catch potential runtime errors at compile time
```typescript
export type UserRole = 'super_admin' | 'admin' | 'cashier' | 'detailer';
export type AppointmentStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
```

**Error Handling as Testing:**
- Try-catch blocks throughout (669 occurrences)
- Defensive programming with null checks
- Example pattern:
```typescript
try {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return NextResponse.json(
      { error: 'Invalid phone number' },
      { status: 400 }
    );
  }
  // proceed with valid data
} catch (error) {
  console.error('Operation failed:', error);
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}
```

## Alternative Quality Measures

**TypeScript Strict Mode:**
- Enabled in `tsconfig.json`
- Catches type mismatches, null reference errors, implicit any types
- Acts as compile-time testing for type correctness

**Zod Schema Validation:**
- Runtime validation for all user inputs
- API route request/response validation
- Form validation via `react-hook-form` + `@hookform/resolvers/zod`

**ESLint:**
- Next.js recommended rules enforce code quality
- Catches common React pitfalls (missing dependencies, incorrect hooks usage)

**Manual Testing Workflow:**
- Development environment with hot reload (`npm run dev`)
- Staging deployment before production
- Multi-device testing (desktop, tablet, mobile)
- Role-based testing (super_admin, admin, cashier, detailer, customer)

**Production Monitoring:**
- Error logging to console (captured by deployment platform)
- User feedback via toast notifications (Sonner)
- Database constraints prevent invalid data states

## Recommendations for Adding Tests

**Priority 1 — Critical Business Logic:**
- `src/lib/utils/format.ts` — phone normalization, currency formatting
- `src/app/pos/utils/tax.ts` — tax calculations
- `src/app/pos/utils/pricing.ts` — dynamic service pricing
- `src/lib/utils/audience.ts` — campaign audience filtering
- `src/lib/auth/permissions.ts` — permission resolution logic

**Priority 2 — Data Layer:**
- Supabase query builders in `src/lib/data/`
- API route handlers for critical operations (payments, bookings, quotes)
- Permission enforcement in `src/lib/auth/check-permission.ts`

**Priority 3 — UI Components:**
- Form validation flows
- Multi-step wizards (booking, campaign creation, coupon wizard)
- State management (POS ticket reducer, quote reducer)

**Recommended Setup:**
```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0",
    "msw": "^2.0.0"
  },
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

**Test Structure Recommendation:**
```
src/
├── lib/
│   └── utils/
│       ├── format.ts
│       └── format.test.ts        # Co-located tests
├── app/
│   └── api/
│       └── book/
│           ├── route.ts
│           └── route.test.ts     # Co-located API tests
```

---

*Testing analysis: 2026-02-16*

**Note:** This is a production Next.js application with zero automated tests. Quality is maintained through TypeScript strict mode, Zod runtime validation, extensive error handling, and manual QA processes. Adding automated tests would improve confidence for refactoring and catch regressions earlier in the development cycle.

# Codebase Structure

**Analysis Date:** 2026-02-16

## Directory Layout

```
AutoDetailApp/
├── src/
│   ├── app/                      # Next.js App Router pages and routes
│   │   ├── (public)/             # Public marketing pages (Server Components)
│   │   ├── (account)/            # Customer portal (authenticated)
│   │   ├── (auth)/               # Staff login
│   │   ├── (customer-auth)/      # Customer signin/signup
│   │   ├── admin/                # Admin panel (cookie auth)
│   │   ├── pos/                  # POS application (HMAC auth)
│   │   ├── api/                  # REST API routes
│   │   ├── auth/                 # Supabase auth callbacks
│   │   ├── authorize/            # Job addon authorization
│   │   ├── jobs/                 # Public job photo gallery
│   │   ├── q/                    # Short link redirects (quotes)
│   │   ├── s/                    # Short link redirects (general)
│   │   ├── unsubscribe/          # SMS/email opt-out
│   │   ├── layout.tsx            # Root layout with fonts, Toaster
│   │   ├── middleware.ts         # Auth, IP restriction, session refresh
│   │   └── globals.css           # Tailwind base styles + brand tokens
│   ├── components/               # Shared UI components
│   │   ├── ui/                   # Base UI primitives (Button, Input, etc.)
│   │   ├── public/               # Public page components
│   │   ├── booking/              # Booking wizard steps
│   │   ├── quotes/               # Quote display components
│   │   └── account/              # Customer portal components
│   ├── lib/                      # Business logic and utilities
│   │   ├── auth/                 # Authentication and permissions
│   │   ├── data/                 # Data access layer
│   │   ├── services/             # Business logic services
│   │   ├── utils/                # Shared utilities
│   │   ├── hooks/                # React hooks
│   │   ├── supabase/             # Supabase client factories
│   │   ├── qbo/                  # QuickBooks integration
│   │   ├── pos/                  # POS-specific utilities
│   │   ├── quotes/               # Quote generation services
│   │   ├── campaigns/            # Marketing campaign utilities
│   │   ├── seo/                  # SEO and metadata helpers
│   │   ├── cron/                 # Internal cron scheduler
│   │   └── types/                # Shared TypeScript types
├── public/
│   └── images/                   # Static images (logos, etc.)
├── supabase/
│   └── migrations/               # Database migrations
├── docs/                         # Project documentation
└── .planning/
    └── codebase/                 # THIS DIRECTORY (codebase analysis)
```

## Directory Purposes

**src/app/(public):**
- Purpose: Public-facing marketing and booking pages
- Contains: Server Components for SEO, dynamic content from CMS
- Key files: `page.tsx` (homepage), `book/page.tsx`, `services/`, `products/`, `gallery/`

**src/app/(account):**
- Purpose: Authenticated customer portal
- Contains: Service history, loyalty, profile, appointments
- Key files: `account/page.tsx` (dashboard), `account/services/`, `account/loyalty/`

**src/app/admin:**
- Purpose: Business management interface
- Contains: All admin pages, settings, reports, catalog management
- Key files: `admin-shell.tsx` (sidebar nav), `page.tsx` (dashboard), `customers/`, `catalog/`, `marketing/`

**src/app/pos:**
- Purpose: Point-of-sale application for staff
- Contains: Register, checkout, quotes, jobs, end-of-day
- Key files: `pos-shell.tsx` (contexts + nav), `components/`, `context/`, `quotes/`, `jobs/`

**src/app/api:**
- Purpose: REST API endpoints
- Contains: Admin routes, POS routes, public routes, webhooks, cron endpoints
- Key files: `admin/`, `pos/`, `webhooks/`, `cron/`, `public/`

**src/components:**
- Purpose: Reusable UI components
- Contains: Shared components across admin, POS, public pages
- Key files: `ui/` (primitives), `public/` (marketing), `booking/` (wizard steps)

**src/lib:**
- Purpose: Business logic, utilities, type definitions
- Contains: Authentication, data access, services, hooks
- Key files: `auth/`, `data/`, `services/`, `utils/`, `supabase/`

**supabase/migrations:**
- Purpose: Database schema evolution
- Contains: Timestamped SQL migration files
- Generated: Sequential from `20250128000001` onward

**docs:**
- Purpose: Project documentation and specs
- Contains: PROJECT.md, CONVENTIONS.md, SERVICE_CATALOG.md, TCPA_AUDIT.md, etc.
- Key files: `PROJECT.md` (master spec), `MEMORY.md` (session context)

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root layout with fonts, global Toaster
- `src/app/(public)/page.tsx`: Public homepage (Server Component)
- `src/app/(public)/book/page.tsx`: Booking wizard entry
- `src/app/pos/page.tsx`: POS application (redirects to register)
- `src/app/admin/page.tsx`: Admin dashboard
- `src/app/(account)/account/page.tsx`: Customer portal dashboard
- `src/middleware.ts`: Request interceptor for auth and IP restriction

**Configuration:**
- `package.json`: Dependencies (Next.js, Supabase, Stripe, Tailwind)
- `tailwind.config.ts`: Tailwind configuration
- `.env.local`: Environment variables (Supabase keys, API keys)
- `next.config.ts`: Next.js configuration

**Core Logic:**
- `src/lib/supabase/server.ts`: Cookie-based Supabase client
- `src/lib/supabase/admin.ts`: Service role client (bypasses RLS)
- `src/lib/data/business.ts`: Business info provider (cached)
- `src/lib/auth/roles.ts`: Sidebar navigation structure, route access
- `src/lib/auth/permissions.ts`: Permission definitions and enforcement
- `src/lib/utils/constants.ts`: Global constants, feature flags

**Testing:**
- Not detected (no test files found)

## Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js convention)
- Layouts: `layout.tsx` (Next.js convention)
- API routes: `route.ts` (Next.js convention)
- Components: `kebab-case.tsx` (e.g., `customer-lookup.tsx`)
- Utilities: `kebab-case.ts` (e.g., `feature-flags.ts`)
- Migrations: `YYYYMMDDNNNNNN_description.sql` (e.g., `20260212000010_variant_id.sql`)

**Directories:**
- Route groups: `(group-name)` (Next.js convention for URL omission)
- Dynamic routes: `[param]` (Next.js convention)
- API namespaces: `lowercase` (e.g., `admin`, `pos`, `webhooks`)
- Component folders: `kebab-case` (e.g., `held-tickets-panel`)

**Variables:**
- React components: PascalCase
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase

**Types:**
- Supabase types: `src/lib/supabase/types.ts` (database-generated)
- Business types: `src/lib/types/` (custom domain types)
- Component props: Inline interfaces or type aliases

## Where to Add New Code

**New Public Page:**
- Primary code: `src/app/(public)/new-page/page.tsx` (Server Component)
- Client interactivity: `src/app/(public)/new-page/client.tsx` (use client)
- SEO metadata: `generateMetadata()` function in `page.tsx`
- Styles: Tailwind classes, globals.css for brand tokens

**New Admin Page:**
- Implementation: `src/app/admin/section/page.tsx`
- API route: `src/app/api/admin/section/route.ts`
- Sidebar nav: Add to `SIDEBAR_NAV` in `src/lib/auth/roles.ts`
- Permission: Define in `src/lib/auth/permissions.ts`, gate with `requirePermission()`

**New POS Feature:**
- Component: `src/app/pos/components/feature-name.tsx`
- Context: `src/app/pos/context/feature-context.tsx` (if needed)
- API route: `src/app/api/pos/feature/route.ts` (with HMAC auth)
- Bottom nav: Update `src/app/pos/components/bottom-nav.tsx` if new tab

**New API Endpoint:**
- Admin: `src/app/api/admin/resource/route.ts` (use `createAdminClient()`)
- POS: `src/app/api/pos/resource/route.ts` (use `authenticatePosRequest()`)
- Public: `src/app/api/public/resource/route.ts` (no auth)
- Webhook: `src/app/api/webhooks/provider/route.ts` (signature validation)

**Utilities:**
- Shared helpers: `src/lib/utils/helper-name.ts`
- Business logic: `src/lib/services/service-name.ts`
- Data access: `src/lib/data/resource-name.ts`

**Database Change:**
- Migration: `supabase/migrations/YYYYMMDDNNNNNN_description.sql`
- Types: Run `supabase gen types typescript` to regenerate `types.ts`

**New Component:**
- Shared UI: `src/components/ui/component-name.tsx`
- Domain-specific: `src/components/domain/component-name.tsx`
- Page-specific: Colocate with page in `src/app/*/components/`

## Special Directories

**src/app/api/cron:**
- Purpose: Internal cron job endpoints (triggered by node-cron scheduler)
- Generated: No
- Committed: Yes
- Authentication: `CRON_API_KEY` header validation

**public/images:**
- Purpose: Static assets (logos, icons)
- Generated: No
- Committed: Yes
- Access: Directly via `/images/*` URL paths

**.next:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (in .gitignore)

**node_modules:**
- Purpose: NPM dependencies
- Generated: Yes
- Committed: No (in .gitignore)

**supabase/.temp:**
- Purpose: Temporary files during migrations
- Generated: Yes
- Committed: No (in .gitignore)

**.planning:**
- Purpose: Codebase analysis documents (GSD framework)
- Generated: Yes (by GSD commands)
- Committed: Yes
- Access: Read by `/gsd:plan-phase` and `/gsd:execute-phase`

---

*Structure analysis: 2026-02-16*

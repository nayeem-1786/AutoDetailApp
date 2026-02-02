# Smart Detail Auto Spa & Supplies

Business management platform for Smart Detail Auto Spa & Supplies — a mobile auto detailing and car care supplies shop in Lomita, CA.

## Tech Stack

- **Framework:** Next.js 16 (App Router, React 19)
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **Styling:** Tailwind CSS v4
- **Payments:** Stripe
- **Language:** TypeScript
- **Fonts:** Geist Sans + Geist Mono

## Architecture

### Public Website (`/`, `/services/*`, `/products/*`)

SEO-optimized public-facing pages built as Server Components. Every service and product has its own URL with `generateMetadata()`, JSON-LD structured data, and inclusion in the dynamic sitemap.

```
src/app/(public)/
├── layout.tsx                — Public layout (header, footer, no auth)
├── page.tsx                  — Homepage (hero, featured services, CTA)
├── services/
│   ├── page.tsx              — All service categories grid
│   └── [categorySlug]/
│       ├── page.tsx          — Category page (services list + pricing)
│       └── [serviceSlug]/
│           └── page.tsx      — Individual service (full pricing + details)
├── products/
│   ├── page.tsx              — All product categories grid
│   └── [categorySlug]/
│       ├── page.tsx          — Category page (products list)
│       └── [productSlug]/
│           └── page.tsx      — Individual product detail
```

**SEO features:**
- `generateMetadata()` on every page (title, description, canonical URL, OpenGraph, Twitter)
- JSON-LD structured data (LocalBusiness, Service, Product, BreadcrumbList)
- Dynamic `/sitemap.xml` with priority weighting (ceramic coatings = 1.0)
- `/robots.txt` allowing public paths, blocking admin/api

### Admin Dashboard (`/admin/*`)

Role-based management interface behind Supabase Auth. Sidebar navigation with modules for catalog management, customers, inventory, staff, appointments, and settings. Header bar includes an account dropdown (initials avatar, name, email, role, status, sign out) on all pages.

**Dashboard Home** — Today's appointments snapshot with status breakdown (remaining, in progress, completed), today's schedule list, pending-confirmation alerts, and role-appropriate quick actions.

**Appointments** — Month calendar with status-colored dots, day appointment list panel, detail/edit dialog (status, reschedule, assign detailer, job notes), and cancel dialog with reason and fee. Status dropdown shows recommended transitions with an "Override" group for staff flexibility. Role-based permissions: detailers see today's schedule only, cashiers cannot cancel appointments, admin/super-admin have full access.

**Staff** — Team member management with profile editing, role reassignment (Super Admin, Admin, Cashier, Detailer), bookable status toggle, and granular per-employee permission overrides.

**Online Booking** (`/book`) — Public-facing booking page with service selection, vehicle info, date/time picker, customer info, and Stripe payment integration.

### Authentication

- Supabase Auth (email/password)
- Middleware protects `/admin/*` routes, redirects unauthenticated users to `/login`
- Public routes (`/`, `/services/*`, `/products/*`, `/book`, `/api/*`) pass through without auth
- Role-based access (super_admin, admin, cashier, detailer) enforced at page level

## Project Structure

```
src/
├── app/
│   ├── (auth)/              — Login page
│   ├── (public)/            — Public SEO pages
│   ├── admin/               — Admin dashboard
│   ├── api/                 — API routes
│   ├── sitemap.xml/         — Dynamic sitemap
│   └── robots.txt/          — robots.txt handler
├── components/
│   ├── public/              — Public-facing Server Components (11)
│   └── ui/                  — Reusable UI component library (22)
├── lib/
│   ├── auth/                — AuthProvider, permissions, roles
│   ├── data/                — Server-side data fetching (services, products, business settings)
│   ├── hooks/               — Client hooks (feature flags, permissions)
│   ├── seo/                 — JSON-LD generators, metadata helpers
│   ├── supabase/            — Client initialization (server, browser, admin, anon)
│   └── utils/               — Constants, formatting, validation, cn()
└── middleware.ts             — Auth + public route handling
```

## Database

38 tables managed via sequential Supabase migrations in `supabase/migrations/`. Seeded staff: Nayeem Khan (super_admin), Su Khan (admin), Joselyn Reyes (cashier), Joana Lira (cashier), Segundo Cadena (detailer). Key tables:

- **services** / **service_categories** — 30 services across 7 categories with 6 pricing models
- **service_pricing** — Tiered pricing with vehicle-size-aware options
- **products** / **product_categories** — Retail car care products
- **employees** — Staff with role-based permissions
- **customers** / **vehicles** — Customer profiles with vehicle records
- **appointments** — Scheduling with mobile zone support
- **transactions** / **payments** — POS with Stripe integration
- **feature_flags** — Database-driven feature toggles
- **business_settings** — Key-value store for business profile (name, phone, address, hours); public pages read from this at render time

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# Run migrations
supabase db push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public site, or [http://localhost:3000/admin](http://localhost:3000/admin) for the dashboard.

## Domain

- **Production:** https://smartdetailsautospa.com
- **Business:** Smart Detail Auto Spa & Supplies, 2021 Lomita Blvd, Lomita, CA 90717

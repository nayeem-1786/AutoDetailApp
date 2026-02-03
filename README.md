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

Role-based management interface behind Supabase Auth. Sidebar navigation with modules for catalog management, customers, inventory, staff, appointments, and settings. Header bar includes an "Open POS" button (opens `/pos` in new tab) and an account dropdown (initials avatar, name, email, role, status, sign out) on all pages.

**Settings** — Feature Toggles, Business Profile, Tax Configuration, Mobile Zones, POS Favorites (configurable quick-action tiles with color/type/label), POS Idle Timeout (auto-logout timer for POS terminal).

**Dashboard Home** — Today's appointments snapshot with status breakdown (remaining, in progress, completed), today's schedule list, pending-confirmation alerts, and role-appropriate quick actions.

**Appointments** — Month calendar with status-colored dots, day appointment list panel, detail/edit dialog (status, reschedule, assign detailer, job notes), and cancel dialog with reason and fee. Status dropdown shows recommended transitions with an "Override" group for staff flexibility. Role-based permissions: detailers see today's schedule only, cashiers cannot cancel appointments, admin/super-admin have full access.

**Staff** — Team member management with profile editing, role reassignment (Super Admin, Admin, Cashier, Detailer), bookable status toggle, and granular per-employee permission overrides.

**Online Booking** (`/book`) — Public-facing booking page with service selection, vehicle info, date/time picker, customer info, and Stripe payment integration.

### POS Terminal (`/pos/*`)

Square-style point-of-sale register with PIN-based employee login, three-tab workspace, and full checkout flow.

**PIN Login** (`/pos/login`) — Dark full-screen 4-digit PIN pad. Auto-submits on 4th digit. Each POS session requires PIN authentication regardless of existing admin session. Uses Supabase magic link token generation under the hood. Rate-limited (5 failures → 15-min lockout).

**Register Tab** — Side-by-side layout: favorites grid (3 columns × up to 5 rows of configurable quick-action tiles) on the left, cents-based keypad with dollar display, description field, and numpad on the right. Favorites support product, service, custom amount, customer lookup (opens customer search dialog), and discount action types.

**Products Tab** — Category-first browsing: category tiles with images → items in category → full product detail page (image, price, SKU, barcode, stock, qty selector, "Add to Ticket"). Search filters products by name/SKU/barcode.

**Services Tab** — Same drill-down pattern: category tiles → services → service detail with tier radio selection and vehicle-size-aware pricing. Auto-selects matching vehicle price when set on ticket. When no vehicle is set, vehicle-size-aware tiers show individual size buttons (Sedan, Truck/SUV, SUV/Van) with respective prices.

**Ticket Panel** — Displays current items with inline-editable quantity (tap the number to type a new value), +/− buttons, per-item price/tax, and remove button. Supports customer/vehicle assignment, coupons, loyalty points, notes, and discount display.

**Bottom Nav** — Log out (employee initials), Checkout (cart badge with item count), Transactions, End of Day, More.

**Checkout Flow** — Payment method selection first: cash, card (Stripe Terminal), check, or split. Card payments use on-reader tipping (15%/20%/25% presets + custom) — tip amount is collected on the Stripe reader hardware and extracted from the processed PaymentIntent. Cash and check payments have no tip. Split payments collect cash first, then process the card remainder with on-reader tipping. Payment complete screen shows summary and receipt options (print, email, SMS). Customer email/phone auto-populated from ticket customer data for receipt delivery.

**Network Restriction** — POS routes (`/pos/*`) can be locked to specific IP addresses via the `ALLOWED_POS_IPS` environment variable (comma-separated). Only enforced in production — local development is unrestricted. Returns 403 to all other IPs.

**Session Management** — POS session tracked via sessionStorage (separate from Supabase auth). Configurable idle timeout auto-logs out after inactivity and clears the current ticket (default 15 min, adjustable in Admin > Settings > POS Idle Timeout).

### Customer Portal (`/account/*`)

Self-service portal for customers with phone OTP as the primary authentication method (Supabase Auth + Twilio), email/password as secondary fallback.

- **Dashboard** — Loyalty points, active coupons, upcoming appointments, quick actions
- **Appointments** — Upcoming/past split view, self-cancellation (24h advance window), rebook
- **Vehicles** — Full CRUD with add/edit dialog and delete confirmation
- **Transactions** — Paginated history with expandable inline detail (items, payments, totals)
- **Loyalty** — Points balance, redemption info, chronological ledger with action badges
- **Profile** — Editable name, phone, marketing consent preferences

Phone-based customer matching automatically links POS/migration customers to portal accounts on first sign-in.

### Authentication

- Supabase Auth (email/password for admin, PIN-based for POS, phone OTP for customer portal)
- Middleware protects `/admin/*` routes, redirects unauthenticated users to `/login`
- Middleware protects `/account/*` routes, redirects unauthenticated users to `/signin`
- POS routes protected by sessionStorage-based POS session flag + Supabase auth
- Public routes (`/`, `/services/*`, `/products/*`, `/book`, `/api/*`) pass through without auth
- Role-based access (super_admin, admin, cashier, detailer) enforced at page level

## Project Structure

```
src/
├── app/
│   ├── (auth)/              — Staff login page
│   ├── (customer-auth)/     — Customer sign-in/sign-up (phone OTP + email)
│   ├── (account)/           — Customer portal (dashboard, appointments, vehicles, transactions, loyalty, profile)
│   ├── (public)/            — Public SEO pages
│   ├── admin/               — Admin dashboard
│   ├── api/                 — API routes (pos, customer, appointments, booking, quotes, etc.)
│   ├── pos/                 — POS terminal
│   │   ├── login/           — PIN-based login page
│   │   ├── components/      — POS UI (register-tab, catalog-browser, pin-pad, etc.)
│   │   ├── context/         — Ticket + checkout state (React Context + useReducer)
│   │   ├── hooks/           — POS hooks (catalog, favorites, barcode scanner)
│   │   └── pos-shell.tsx    — POS layout wrapper (auth gate, idle timeout, top/bottom nav)
│   ├── sitemap.xml/         — Dynamic sitemap
│   └── robots.txt/          — robots.txt handler
├── components/
│   ├── account/             — Customer portal components (13)
│   ├── public/              — Public-facing Server Components (11)
│   └── ui/                  — Reusable UI component library (24)
├── lib/
│   ├── auth/                — AuthProvider, CustomerAuthProvider, permissions, roles
│   ├── data/                — Server-side data fetching (services, products, business settings)
│   ├── hooks/               — Client hooks (feature flags, permissions)
│   ├── seo/                 — JSON-LD generators, metadata helpers
│   ├── supabase/            — Client initialization (server, browser, admin, anon)
│   └── utils/               — Constants, formatting, validation, cn()
└── middleware.ts             — Auth + public route handling
```

## Database

44 migrations in `supabase/migrations/`. Seeded staff: Nayeem Khan (super_admin), Su Khan (admin), Joselyn Reyes (cashier), Joana Lira (cashier), Segundo Cadena (detailer). Key tables:

- **services** / **service_categories** — 30 services across 7 categories with 6 pricing models
- **service_pricing** — Tiered pricing with vehicle-size-aware options
- **products** / **product_categories** — Retail car care products
- **employees** — Staff with role-based permissions and optional 4-digit POS PIN
- **customers** / **vehicles** — Customer profiles with vehicle records
- **appointments** — Scheduling with mobile zone support
- **transactions** / **payments** — POS with Stripe integration
- **feature_flags** — Database-driven feature toggles
- **business_settings** — Key-value store for business profile (name, phone, address, hours), POS favorites config, POS idle timeout; public pages and POS read from this at render time

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

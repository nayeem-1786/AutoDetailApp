# Technology Stack

**Analysis Date:** 2026-02-16

## Languages

**Primary:**
- TypeScript 5.x - All application code (strict mode enabled)
- JavaScript (ESM/CJS) - Build config and tooling

**Secondary:**
- SQL - Supabase database migrations (129 migration files)

## Runtime

**Environment:**
- Node.js v22.19.0

**Package Manager:**
- npm 10.9.3
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.1.6 - React framework with App Router
- React 19.2.3 - UI library
- React DOM 19.2.3

**Testing:**
- Not detected

**Build/Dev:**
- TypeScript compiler with target ES2017
- ESLint 9.x with Next.js config
- PostCSS with Tailwind CSS 4
- Sharp 0.34.5 - Image optimization

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` 2.95.3 - Database client
- `@supabase/ssr` 0.8.0 - Server-side rendering support
- `stripe` 20.3.0 - Payment processing (server SDK)
- `@stripe/stripe-js` 8.7.0 - Browser SDK
- `@stripe/react-stripe-js` 5.6.0 - React components
- `@stripe/terminal-js` 0.26.0 - Card reader integration

**UI & Forms:**
- `tailwindcss` 4 - Utility-first CSS
- `clsx` 2.1.1 + `tailwind-merge` 3.4.0 - Class name utilities
- `lucide-react` 0.563.0 - Icon library
- `framer-motion` 12.34.0 - Animation library
- `react-hook-form` 7.71.1 - Form management
- `@hookform/resolvers` 5.2.2 - Validation adapters
- `zod` 4.3.6 - Schema validation

**Data & Analytics:**
- `@tanstack/react-table` 8.21.3 - Table component
- `recharts` 3.7.0 - Chart library
- `date-fns` 4.1.0 - Date utilities
- `papaparse` 5.5.3 + `csv-parse` 6.1.0 - CSV parsing

**Infrastructure:**
- `pdfkit` 0.17.2 - PDF generation
- `sonner` 2.0.7 - Toast notifications
- `node-cron` 4.2.1 - Internal job scheduler

**Process Management:**
- PM2 (via `ecosystem.config.cjs`) - Production deployment

## Configuration

**Environment:**
- Configured via `.env.local` (development)
- Critical env vars required:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`
  - `MAILGUN_DOMAIN`
  - `MAILGUN_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `CRON_API_KEY`
  - `QBO_CLIENT_ID`
  - `QBO_CLIENT_SECRET`
  - `GOOGLE_PLACES_API_KEY` (optional)

**Build:**
- `tsconfig.json` - TypeScript configuration with path alias `@/*` → `./src/*`
- `next.config.ts` - External packages: `pdfkit`, `sharp`
- `eslint.config.mjs` - Next.js web vitals + TypeScript rules
- `postcss.config.mjs` - Tailwind CSS processor

## Platform Requirements

**Development:**
- Node.js 22.x
- npm 10.x
- Supabase CLI 2.74.5 (dev dependency)

**Production:**
- Node.js 22.x runtime
- PM2 process manager (fork mode, 1 instance, 512MB memory limit)
- Port 3000
- Deployment path: `/var/www/autodetailapp`
- Logging: `/var/log/autodetailapp/`

---

*Stack analysis: 2026-02-16*

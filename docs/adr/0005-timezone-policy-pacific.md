# ADR-0005: Timezone policy — America/Los_Angeles

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** Nayeem

## Context

Smart Details is a single-shop business operating out of one physical
location in the South Bay (LA County). All scheduling, reminders,
dashboards, receipts, cron jobs, and audit logs need to reflect what
the staff and customers actually experience — which is Pacific time.

Storing UTC and converting on display sounds neutral but introduces
recurring bugs in practice: a cron job set to "8 AM PST" silently runs
at 8 AM UTC (midnight PST) if the wrapper forgets the timezone; an
appointment scheduled at "10:30 AM" appears as "06:30 PM" on a date
formatter that defaults to UTC; a date-only string `2026-05-13` shifts
backwards a day when `new Date("2026-05-13")` is interpreted as UTC
midnight in a Pacific timezone runtime.

## Decision

**All application date logic uses `America/Los_Angeles` explicitly,
never UTC.** This applies to:

- Scheduling and reminder cron jobs (`src/lib/cron/scheduler.ts`,
  `src/instrumentation.ts`)
- Display formatters (`formatReceiptDateTime`,
  `formatReceiptDateTimeCompact` in `src/lib/utils/format.ts`)
- Date-only fields (`scheduled_date`, `appointment_date`) — parsed via
  the `YYYY-MM-DD` local-construction path in `formatDate`, never via
  `new Date(string)`
- Audit and lifecycle logs visible to operators
- Voice agent transcript timestamps

Postgres still stores `TIMESTAMPTZ` columns in UTC under the hood — that
is the correct storage canonical. The discipline is at the
**application layer**: every `Intl.DateTimeFormat`, `toLocaleString`, or
date construction explicitly passes `timeZone: 'America/Los_Angeles'`
or uses one of the helpers that already does so.

CLAUDE.md Rule 1 codifies this; `src/lib/cron/scheduler.ts` is the
single source for all internal cron jobs to enforce timezone-aware
scheduling.

## Consequences

**Positive:**
- What staff and customers see on the screen matches the wall clock
- Cron jobs fire when scheduled relative to business hours, not UTC
- Date-only fields don't shift across the date line at midnight UTC

**Negative:**
- The codebase cannot trivially serve a shop in a different timezone
  without an audit pass through every date-formatting call site
- DST transitions still need care for boundary cases (the existing
  scheduler handles them; new cron jobs must use the scheduler, not
  ad-hoc `setInterval` timing)

**Neutral:**
- DB queries that compare timestamps continue to work in UTC; only the
  formatting layer enforces Pacific.

## Alternatives Considered

**Configurable timezone via a `business_settings` value.** Rejected.
The shop is single-location; the config would be set once and never
change. Adding the config knob means every cron and formatter has to
read it, multiplying complexity for no operational gain. If we ever
add a second location, this ADR is the place to revisit.

**Store UTC, format-on-display via `Intl` defaults.** Rejected — that
WAS the failure mode that prompted this ADR. `Intl` defaults to the
runtime's local timezone, which differs between development (Pacific),
production (server timezone), and tests (UTC by convention). Explicit
`timeZone: 'America/Los_Angeles'` is necessary.

**Vercel/Hostinger TZ env var.** Considered as a backstop. Application
code still needs to pass `timeZone` explicitly — the environment
default isn't reliable across formatters and `new Date(string)`
parsing.

## Related ADRs

_(none yet — independent decision)_

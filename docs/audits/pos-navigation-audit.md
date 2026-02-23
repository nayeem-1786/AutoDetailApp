# POS Navigation Audit

> Date: 2026-02-21
> Purpose: Complete inventory of all POS navigation elements to plan UX reorganization

## 1. Header Bar (left to right)

| # | Element | Type | Icon | Action | Visibility | Touch Target |
|---|---------|------|------|--------|------------|-------------|
| 1 | Back/Admin link | `<Link>` | `ArrowLeft` | If on `/pos` → `/admin`. Otherwise → `/pos`. Label "Admin" or "POS" (hidden mobile). | Always | Text link — no min size |
| 2 | "Smart Detail POS" | Text | — | Brand label, no action | Always | N/A |
| 3 | Card Reader status | Badge/Button | `Wifi`/`WifiOff`/`Loader2` | 3 states: Connecting (spinner), Connected (green badge), Disconnected (click to connect) | Always (one state) | `px-2 py-1` pill — no min size |
| 4 | Scanner indicator | Static badge | `ScanLine` | "Disconnected" — non-interactive, purely visual | Always | N/A |
| 5 | Held Tickets | Button | `PauseCircle` | Opens HeldTicketsPanel. Shows "N held" when > 0, gray icon when 0. | Always | `px-2.5 py-1` pill — no min size |
| 6 | Offline Queue | Badge | `CloudOff` | "N pending" — non-interactive. Auto-syncs when online. | Only when queue > 0 | N/A |
| 7 | Recent Transactions | Button | `Clock` | Dropdown: today's last 10 transactions. Click row → transaction detail. "View All" → `/pos/transactions`. | Always | 32x32px |
| 8 | Employee name | Text | — | Current employee first name | Always | N/A |
| 9 | Role badge | Text | — | Role label (Manager, Cashier, etc.) | Always | N/A |
| 10 | Clock | Text | — | Live clock, 10s updates | Always | N/A |
| 11 | PWA Refresh | Button | `RotateCw` | `window.location.reload()` | PWA standalone only | 44x44px |
| 12 | Fullscreen Toggle | Button | `Maximize`/`Minimize` | Browser fullscreen API | Desktop browser only | 44x44px |
| 13 | Theme toggle (3 btns) | Button group | `Sun`/`Moon`/`Monitor` | Light / Dark / System | Always | 44x44px each (~132px total) |
| 14 | Shortcuts help | Button | `?` text | Toggles keyboard shortcuts modal | Always | 24x24px (undersized) |

**Total interactive header elements: 8-10** (depending on conditional visibility)

## 2. Bottom Nav (left to right)

| # | Tab | Icon | Label | Route / Action | Active State | Conditional? |
|---|-----|------|-------|----------------|-------------|-------------|
| 1 | Log Out | `LogOut` | Employee initials or "Out" | `posSignOut()` → `/pos/login` | No active state | Always |
| 2 | Register | `Vault` | "Register" | `/pos/end-of-day` | Blue on match. Green dot when drawer open. | Always |
| 3 | Transactions | `Receipt` | "Transactions" | `/pos/transactions` | Blue on match | Always |
| 4 | Quotes | `FileText` | "Quotes" | `/pos/quotes` | Blue on match | Always |
| 5 | Jobs | `ClipboardList` | "Jobs" | `/pos/jobs` | Blue on match | Always |
| 6 | More | `MoreHorizontal` | "More" | Opens popover | Blue when open | Always |

All 6 slots used. All always visible. Touch targets: `min-h-[44px] min-w-[44px]`.

**No bottom nav tab for the main POS workspace (`/pos`).** Must use header back arrow.

## 3. "More" Menu

Trigger: Bottom nav #6. Popover above button.

| # | Option | Icon | Route | Description |
|---|--------|------|-------|-------------|
| 1 | Go to Admin | `ExternalLink` | `/admin` | Navigate to admin dashboard |
| 2 | Settings | `Settings` | `/admin/settings` | Navigate to admin settings |

**Only 2 items.** Severely underutilized.

## 4. Other Persistent UI

| Element | Type | Trigger | Description |
|---------|------|---------|-------------|
| OfflineIndicator | Fixed banner | Auto (offline) | Amber top banner when offline, green briefly on reconnect. `z-[100]` fixed. |
| CheckoutOverlay | Full-screen | `openCheckout()` | Payment/checkout flow |
| HeldTicketsPanel | Slide-over | Header button #5 | Parked/held tickets |
| Keyboard Shortcuts | Modal | Header `?` or `?` key | F1/F2/F3/Esc shortcuts. `z-50`. |
| Lock screen (PinScreen) | Full overlay | Auto (idle) | PIN re-auth or employee switch |

## 5. POS Routes

| Route | Purpose | Accessed Via |
|-------|---------|-------------|
| `/pos` | Main workspace — ticket + catalog | Default after login. No bottom nav tab. Header back arrow from sub-pages. |
| `/pos/login` | PIN login | Auto-redirect. Logout. Own layout (no shell). |
| `/pos/transactions` | Transaction list | Bottom nav. Recent Txns "View All". |
| `/pos/transactions/[id]` | Transaction detail | Click row from list/dropdown |
| `/pos/quotes` | Quotes list/detail/builder | Bottom nav. F3. Admin deep-links. |
| `/pos/jobs` | Job queue & detail | Bottom nav |
| `/pos/end-of-day` | Register open/close, day summary | Bottom nav "Register" |
| `/pos/offline` | Offline fallback | Automatic |

## 6. Permission-Gated Features

| Permission Key | Feature | Location |
|---------------|---------|----------|
| `pos.end_of_day` | Open/close register | End of Day page |
| `pos.jobs.manage` | Create walk-ins, checkout, create job from quote | Job queue/detail, quote detail |
| `pos.jobs.cancel` | Cancel jobs | Job detail |
| `pos.jobs.flag_issue` | Flag issues | Job detail |
| `pos.manual_discounts` | Manual discounts | Ticket panel, quote ticket panel |
| `pos.issue_refunds` | Issue refunds | Transaction detail |
| `pos.void_transactions` | Void transactions | Transaction detail |

## 7. Issues Found

### Header Clutter (HIGH)
- 14 elements in a 56px bar — very crowded on tablet
- Theme toggle alone: ~132px (3x 44px buttons) for a rarely-changed setting
- Scanner indicator: static "Disconnected" with no interaction — dead weight
- Employee name + role + clock: 3 read-only texts consuming width
- `?` button: 24x24px — undersized for touch

### Bottom Nav Slot Misallocation
- **No "Home" / Sale tab** for main workspace (`/pos`) — most-used screen has no tab
- **Logout in slot #1** — infrequent action in most prominent position
- **"Register" misleading** — sounds like main POS; actually routes to end-of-day/cash drawer

### More Menu Wasted
- Only 2 items, both navigate away from POS
- Could absorb infrequent header items (theme, shortcuts, scanner, reader)

### Redundant Navigation
- "Go to Admin": header back arrow (on `/pos`) + More menu
- Recent Txns "View All" duplicates Transactions tab
- F3 duplicates Quotes tab

### Missing Actions
- No "New Sale" button from sub-pages (only F1 keyboard shortcut)
- No barcode scanner connection action
- No employee switch button (must timeout or logout)
- No manual "Lock" button

### Touch Target Violations
- Header back arrow: no min-height/width
- Reader/scanner pills: no min-size
- `?` button: 24x24px (needs 44x44px)
- Recent Transactions: 32x32px (needs 44x44px)

## 8. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F1 | Clear ticket (new sale) |
| F2 | Open checkout (if items in ticket) |
| F3 | Navigate to quotes |
| Esc | Close shortcuts overlay → close held panel |
| ? | Toggle shortcuts help |

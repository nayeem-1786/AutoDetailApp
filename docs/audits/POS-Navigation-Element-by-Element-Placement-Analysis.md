# POS Navigation Element-by-Element Placement Analysis

## Methodology

Each of the 22 interactive elements in the current POS interface is evaluated against:
- **Purpose**: What does it do?
- **Frequency**: How often is it used per shift? (Critical / Frequent / Occasional / Rare)
- **Industry precedent**: Where do Square, Toast, Clover, Shopify place equivalent functions?
- **Fitts's Law**: Is its current position optimized for reach speed?
- **Apple HIG**: Does it meet 44x44pt touch targets? Is it in the right UI zone?

Frequency tiers:
- **Critical** = every transaction (dozens/hundreds per shift)
- **Frequent** = multiple times per shift (5-30x)
- **Occasional** = a few times per shift (1-5x)
- **Rare** = once per shift or less

---

## USER DECISIONS (Owner Overrides)

The following decisions were made by the business owner and override the original analysis recommendations:

1. **Remove back arrow** from header entirely — not needed with the new bottom nav "Sale" tab + "Go to Dashboard" in More menu
2. **Center the business name** in the header — becomes the visual anchor
3. **Swap header zones** — identity (name + role) goes LEFT, status indicators go RIGHT
4. **Keep scanner indicator** next to card reader (hardware grouped together in right zone)
5. **Keep first name + role badge, remove clock** — clock is on every device already; name/role provides accountability
6. **Rename "Go to Admin" → "Go to Dashboard"** — clearer label, rarely used by cashiers/detailers
7. **Remove "Settings" from More menu entirely** — Settings is admin-only; POS staff should never access it
8. **Remove lock screen (PinScreen)** — Auto-logout via POS Idle Timeout (Admin > Settings) handles session security. Will be set to ~5 minutes in production (currently 90 min for testing).
9. **Bottom nav order**: Transactions, Quotes, **Sale** (center), Jobs, More — 5 slots evenly spaced
10. **Delete all dead/orphaned code** — remove unused component files, clean imports

---

## HEADER ELEMENTS (Currently 16 elements in 56px)

### 1. Back/Exit Arrow (Header Left)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Navigate between POS and Admin |
| **Frequency** | Rare — staff stay in POS during their shift |
| **Industry** | Square: hamburger menu. Toast: sidebar toggle. Most POS systems don't have a back-to-admin link in the header at all — admin is a separate app or accessed through Settings |
| **Current issue** | No min-size (touch target violation) |
| **Recommendation** | ~~Keep in header~~ **DECISION: Remove entirely.** With the new bottom nav providing a "Sale" tab and "Go to Dashboard" in the More menu, the header back arrow is redundant. Removing it declutters the header left zone and allows the business name to center properly. |
| **Why this is better** | The back arrow was a crutch for the missing "Sale" tab. With Sale as bottom nav slot #1, there's always a one-tap path back to the main POS screen. The "Go to Dashboard" item in More handles the rare admin-escape case. |

### 2. "Smart Detail POS" Brand Text (Header Center)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Brand identity / orientation |
| **Frequency** | N/A — display only, never interacted with |
| **Industry** | Square shows store name. Toast shows restaurant name. Clover shows business name. All keep it minimal. |
| **Current issue** | Takes space but provides no functionality |
| **Recommendation** | **DECISION: Center in header.** With the back arrow removed, the business name becomes the header's left-to-center anchor. Centered text with operational indicators on the right creates a clean, balanced layout. Responsive: "Smart Detail POS" on wide screens, "POS" on narrow. |
| **Why this is better** | A centered business name is the standard POS pattern (Square, Toast, Clover all do this). It provides brand identity and visual anchoring without consuming interactive space. |

### 3. Card Reader Status (Header Right)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Shows payment terminal connection state; click to reconnect |
| **Frequency** | Occasional — glanced at frequently, clicked rarely (only when disconnected) |
| **Industry** | Square: hardware status in Settings > Hardware. Toast: indicator dot in header. Clover: dedicated hardware settings page. **However**, for Stripe Terminal specifically, connection awareness is critical because it drops more often than built-in hardware. |
| **Current issue** | Touch target too small (px-2 py-1) |
| **Recommendation** | **Keep in header right zone.** This is a real-time operational indicator — staff need to see at a glance whether the reader is connected before starting a transaction. Burying it in a menu would cause failed payment attempts. Fix touch target to 44px minimum. |
| **Why this is better** | Payment readiness is the #1 thing an employee checks before ringing up a sale. Header placement provides ambient awareness without requiring any action — the green/red state is visible peripherally. This matches Toast's approach of header status indicators for critical hardware. |

### 4. Scanner Indicator (Header Right) — STATIC, NON-INTERACTIVE

| Attribute | Value |
|-----------|-------|
| **Purpose** | Shows barcode scanner connection status |
| **Frequency** | Never — it's not clickable, just displays "Disconnected" |
| **Industry** | No POS system wastes header real estate on a non-interactive hardware indicator. Hardware status belongs in a settings/hardware page. |
| **Current issue** | Takes up ~100px of header space for zero utility. Can't be clicked. Doesn't change state. Always says "Disconnected." |
| **Recommendation** | ~~Delete entirely.~~ **DECISION: Keep in header, grouped next to Card Reader.** Owner wants hardware indicators grouped together in the right zone for visual consistency. The scanner indicator stays next to the card reader so all hardware status is in one place. Future scanner integration will make this indicator functional. |
| **Why this is better** | Grouping hardware indicators (scanner + reader) together creates a logical "hardware status" cluster in the header right zone. When scanner support is added, the indicator is already positioned correctly. |

### 5. Held Tickets Badge/Button (Header Right)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Shows count of held/paused tickets; click to open held tickets panel |
| **Frequency** | Frequent — used 5-20x per shift in busy shops (hold current customer's ticket, serve next, resume) |
| **Industry** | Toast: "Open Orders" tab. Square: "Open Tickets" accessible from main screen. This is a core POS workflow — hold and recall is essential for multi-customer environments. |
| **Current issue** | Touch target too small; two conditional render branches could be merged |
| **Recommendation** | **Keep in header right zone.** Held tickets are part of active transaction management — the count badge provides critical ambient information (how many customers are waiting). This is analogous to Toast's "Open Orders" count. Fix touch target to 44px. Merge the two conditional branches into a single component. |
| **Why this is better** | A held ticket count in the header acts like a "customers waiting" counter. It creates urgency and awareness. Putting it in the bottom nav would waste a permanent slot on something that's only relevant when tickets are actually held. Putting it in More would hide critical operational state. The header is the right zone for "status + quick action" combos. |

### 6. Offline Queue Badge (Header Right) — CONDITIONAL

| Attribute | Value |
|-----------|-------|
| **Purpose** | Shows number of transactions pending sync when offline |
| **Frequency** | Rare — only appears during network outages |
| **Industry** | Square: shows offline banner at top. Toast: connection indicator in header. Offline indicators universally live in the header/top bar because they represent system health. |
| **Current issue** | Small touch target, but it's non-interactive (display only) |
| **Recommendation** | **Keep in header, as-is.** This is a system health indicator. It correctly auto-hides when not relevant (count = 0) and only appears when there's a problem. This follows the exact pattern of every POS system — critical status warnings go in the header. No change needed beyond touch target sizing. |
| **Why this is better** | System health indicators belong in the persistent header where they provide ambient awareness. This is already correctly implemented — conditional visibility prevents clutter during normal operation, and header placement ensures it's never missed during outages. |

### 7. Recent Transactions Dropdown (Header Right)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Quick-access dropdown showing last 10 transactions from today |
| **Frequency** | Occasional — used to verify/void recent sales, but Transactions tab provides the same data |
| **Industry** | Square: no equivalent in header — transactions are a dedicated tab. Toast: recent orders in sidebar. Clover: accessible from home screen. **No major POS puts a transaction dropdown in the header.** |
| **Current issue** | Undersized touch target (32px). Duplicates the Transactions bottom nav tab functionality. Auto-refresh timer adds unnecessary network load. |
| **Recommendation** | **Remove entirely.** The Transactions tab (bottom nav) provides the same information with better UX (full-page list, filters, search). This dropdown exists because there was no easy way to reach Transactions — but with the proposed "Sale" tab making `/pos` reachable, and Transactions already having its own bottom nav tab, this dropdown is fully redundant. |
| **Why this is better** | Redundant navigation paths violate the "single source of truth" UX principle. Users shouldn't have to decide between two different transaction views. The full Transactions page is always better than a cramped 10-item dropdown. Removing it saves header space and eliminates the background polling. Square's approach of making Transactions a first-class tab (not a header shortcut) is the proven pattern. |

### 8-9. Employee Name + Role Badge (Header Right) — Clock Removed

| Attribute | Value |
|-----------|-------|
| **Purpose** | Display-only: shows who's logged in and their role |
| **Frequency** | N/A — display only, never interacted with |
| **Industry** | Square: employee name in header or status bar. Toast: server name visible. Clover: employee name in header. |
| **Current issue** | Takes horizontal space but provides important context |
| **Recommendation** | **DECISION: Keep name + role badge, remove clock.** The clock is redundant — every iPad, phone, and desktop already shows the time in the system status bar. Removing it saves ~70px of header space. Employee name + role badge provide accountability ("who did this transaction?") and permission awareness ("what can I do?"). Layout: `Nayeem (Manager)` |
| **Why this is better** | The clock was taking premium header space to duplicate information already visible in the device's status bar. Name + role provide non-redundant, business-critical information — every POS system shows the logged-in user prominently. |

### 11. PWA Refresh Button (Header Right) — CONDITIONAL

| Attribute | Value |
|-----------|-------|
| **Purpose** | Manual page reload for PWA standalone mode (no browser refresh button available) |
| **Frequency** | Rare — used only when app feels stale or after updates |
| **Industry** | PWA-specific concern. Most POS apps are native and handle updates silently. For web-based POS (like Lightspeed), refresh is either automatic or in Settings. |
| **Current issue** | Only visible in PWA standalone mode (correct). Touch target is fine (44px). But it takes header space for a rarely-used action. |
| **Recommendation** | **Move to More menu.** PWA refresh is a maintenance action, not an operational one. It's used maybe once or twice per shift at most. The More menu is the correct home for "app maintenance" actions. Show only in PWA standalone mode (same conditional, just in the menu instead of header). |
| **Why this is better** | Header space is premium real estate. A rarely-used maintenance button doesn't justify permanent header presence. Fitts's Law says the most reachable positions should have the most frequently used elements. Moving this to More follows the industry pattern of putting app-level utilities in a settings/menu area. Staff who need it will find it in More; staff who don't need it won't be distracted by it. |

### 12. Fullscreen Toggle (Header Right) — CONDITIONAL

| Attribute | Value |
|-----------|-------|
| **Purpose** | Toggle browser fullscreen mode |
| **Frequency** | Rare — typically toggled once at start of shift, then left alone |
| **Industry** | No major POS system exposes a fullscreen toggle in the header. Native iPad apps are inherently fullscreen. Web-based POS systems (Lightspeed) handle this in Settings or rely on the browser's built-in F11/fullscreen. |
| **Current issue** | Only visible on desktop browsers with fine pointer (correct conditional). Touch target is fine (44px). Takes header space for a once-per-session action. |
| **Recommendation** | **Move to More menu.** This is a "set once, forget" action. It has no place in the operational header. Show only when the browser supports fullscreen API (same conditional). |
| **Why this is better** | Same reasoning as PWA Refresh — rare actions don't belong in premium header space. The fullscreen toggle is used at most once per shift. Moving it to More follows the universal pattern of putting display/appearance settings in a menu. |

### 13-15. Theme Toggle — Light / Dark / System (Header Right)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Switch between light mode, dark mode, and system-follow theme |
| **Frequency** | Rare — typically set once per user preference, rarely changed mid-shift |
| **Industry** | Square: in Settings > Display. Toast: in Settings > Appearance. Clover: no dark mode. Shopify: Settings. **No POS system puts a 3-button theme toggle in the header.** This is universally a Settings-level preference. |
| **Current issue** | Consumes 132px of header space (3 x 44px buttons) for a feature used ~0 times per shift. This is the single biggest space waster in the header. |
| **Recommendation** | **Move to More menu as a compact segmented control.** Three inline buttons (Light / Dark / System) inside the More popover, styled as a segmented control. This saves 132px of header space while keeping the feature easily accessible. |
| **Why this is better** | A theme preference is a personal setting, not an operational control. No employee changes themes during a transaction. The 132px this occupies could fit two operational indicators instead. Every major POS system puts appearance settings in a preferences menu — having it in the header is an anomaly that wastes the most constrained UI resource (horizontal header space on iPad). |

### 16. Keyboard Shortcuts Help "?" Button (Header Right)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Opens modal showing available keyboard shortcuts |
| **Frequency** | Rare — used by new employees learning the system, then almost never |
| **Industry** | Most POS systems don't expose a shortcuts button at all — shortcuts are documented in help/training materials. VS Code puts its shortcut reference in the command palette, not the toolbar. |
| **Current issue** | Tiny (24px) — worst touch target violation in the entire interface. Also redundant with the `?` keyboard shortcut itself. |
| **Recommendation** | **Move to More menu as "Keyboard Shortcuts."** This is a help/reference feature, not an operational tool. The `?` keyboard shortcut remains the primary access path for users who already know it exists. The More menu entry serves as the discoverable path for new users. |
| **Why this is better** | Help and reference items belong in menus, not toolbars. The 24px button violates Apple's 44px minimum by 20px — it's essentially untappable on iPad. Moving to More gives it a proper 44px touch target and groups it with other "app utility" items. Power users will continue using the `?` key; the menu item exists for discoverability. |

---

## BOTTOM NAV ELEMENTS (Currently 6 slots)

### Slot 1: Log Out (Current)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Sign out current employee, return to PIN login |
| **Frequency** | Rare — used once at end of shift, or during employee handoff |
| **Industry** | **No POS system puts Logout in the bottom nav.** Square: Settings > Sign Out. Toast: Menu > Log Out. Clover: Settings > Logout. Logout is universally buried in a menu because it's infrequent and destructive (ends the session). |
| **Current issue** | Occupies slot #1 (leftmost = most prominent position per Fitts's Law). An infrequent, destructive action in the most reachable position is a UX anti-pattern. Risk of accidental logout. No confirmation dialog. |
| **Recommendation** | **Move to More menu, last item, with red text.** Logout should be the last item in the More menu, visually distinguished with red text and employee initials badge. This follows the universal pattern across every POS system studied. |
| **Why this is better** | Fitts's Law: the leftmost bottom nav position is the easiest to reach (closest to natural thumb position for right-handed users on iPad). Putting a destructive, once-per-shift action here is backwards — it should be the *hardest* to accidentally reach. Every POS competitor puts logout behind at least one menu layer. The More menu provides that layer while keeping it accessible when intentionally needed. Red text provides visual warning of the destructive nature. |

### Slot 2: Register → Cash Drawer (Current)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Navigate to end-of-day / cash drawer management |
| **Frequency** | Occasional — used 1-3x per shift (open drawer, close drawer, cash drops) |
| **Industry** | Square: Register menu > Cash Drawer. Toast: Manager Functions > Cash Management. Clover: Register > Cash Management. **Cash drawer management is universally in a menu, not a primary nav tab.** It's an operational task, not a navigation destination. |
| **Current issue** | Label "Register" is misleading — users expect it to go to the register/selling screen, but it goes to cash drawer management. Green dot indicator (drawer open) is useful but attached to a misleadingly-named tab. |
| **Recommendation** | **Move to More menu as "Cash Drawer" with green dot indicator.** Rename from "Register" to "Cash Drawer" for clarity. Keep the green dot for drawer-open status. This matches the industry pattern of cash management being an operational action in a menu, not a primary tab. |
| **Why this is better** | "Register" as a label is actively confusing — in POS terminology, "register" means the selling interface, not cash drawer management. Renaming to "Cash Drawer" eliminates ambiguity. Moving to More frees up a bottom nav slot for a more frequently used destination. The green dot indicator is preserved in the menu, maintaining drawer status awareness. Cash drawer is an operational task (1-3x/shift), not a navigation destination that needs a permanent tab. |

### Slot 3: Transactions (Current)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Navigate to transaction history / list |
| **Frequency** | Frequent — used 5-15x per shift (check receipts, process refunds, verify payments) |
| **Industry** | Square: "Transactions" tab. Toast: "Orders" tab (includes transactions). Clover: "Orders" or "Transactions" tab. This is universally a primary nav destination. |
| **Recommendation** | **Keep as bottom nav tab.** Transaction history is a core POS function that deserves primary navigation. Every POS system includes this as a main tab. |
| **Why this is better** | Already correctly placed. No change needed. |

### Slot 4: Quotes (Current)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Navigate to quotes list / quote builder |
| **Frequency** | Frequent — used 5-20x per shift (create quotes for detailing services, follow up on sent quotes) |
| **Industry** | Most POS systems don't have quotes (retail doesn't need them). But for service-based businesses (detailing, repair shops), quotes are a primary workflow. ServiceTitan, Jobber, and other service POS systems put quotes/estimates as a primary tab. |
| **Recommendation** | **Keep as bottom nav tab.** For a detailing business, quotes are a core workflow — arguably more important than transaction history since they drive future revenue. |
| **Why this is better** | Already correctly placed for a service-based POS. |

### Slot 5: Jobs (Current)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Navigate to active jobs list |
| **Frequency** | Frequent — used 5-20x per shift (check job status, update progress, mark complete) |
| **Industry** | ServiceTitan: "Jobs" or "Dispatch" tab. Jobber: "Jobs" tab. Service-based POS systems treat jobs as a primary navigation destination. |
| **Recommendation** | **Keep as bottom nav tab.** Jobs are the active work queue — essential for a service-based business. |
| **Why this is better** | Already correctly placed for a service-based POS. |

### Slot 6: More (Current — only 2 items)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Menu for additional options |
| **Frequency** | Occasional — used when accessing secondary functions |
| **Industry** | Every POS system has a More/Menu/Settings tab as the rightmost bottom nav item. It's the universal overflow pattern. |
| **Current issue** | Severely underutilized with only 2 items (Admin, Settings). Should absorb all the items being removed from header and bottom nav. |
| **Recommendation** | **Keep as bottom nav tab, expand to absorb relocated items.** This becomes the home for: Cash Drawer, Theme Toggle, PWA Refresh, Fullscreen, Keyboard Shortcuts, Admin link, Settings link, and Log Out. |
| **Why this is better** | A More menu with 2 items is a wasted tab. Expanding it to 8-9 items makes it a proper utility hub, matching the industry pattern where More/Settings contains all operational and preference items. |

### NEW: Slot 1 — "Sale" Tab (Proposed)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Navigate to the main selling/register screen (`/pos`) |
| **Frequency** | Critical — this IS the POS. Every transaction starts here. Used dozens of times per shift. |
| **Industry** | Square: "Checkout" or home screen is default. Toast: "New Order" is primary. Clover: home screen. **Every POS system makes the selling screen the most prominent, easiest-to-reach destination.** |
| **Current issue** | The main POS screen (`/pos`) currently has NO bottom nav tab. The only way to return to it from a sub-page is the header back arrow. This is the most critical UX gap in the entire interface. |
| **Recommendation** | **Add as bottom nav slot #1 (leftmost).** Use ShoppingCart icon with "Sale" label. Active when `pathname === '/pos'` (exact match). This is the single most important change in the entire reorganization. |
| **Why this is better** | Fitts's Law: the leftmost bottom tab is the easiest and fastest to reach. The most-used screen in any POS should occupy this position. Currently, the most-used screen is the *only* one without a bottom nav tab — forcing users to reach up to the header to navigate back. This violates every POS design principle. Adding "Sale" as tab #1 means the most-used destination is one tap away from anywhere in the app, in the most reachable position. This is what Square, Toast, and every successful POS does. |

---

## MORE MENU ITEMS (Proposed — currently only 2)

### Go to Dashboard (Currently "Go to Admin" in More + Header back arrow)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Navigate to admin dashboard |
| **Frequency** | Rare — managers/owners use occasionally, cashiers/detailers almost never |
| **Industry** | Square: separate app entirely. Toast: "Restaurant Admin" link in menu. Most POS systems separate admin from POS. |
| **Recommendation** | **DECISION: Rename to "Go to Dashboard" and keep in More menu.** "Dashboard" is a more intuitive label than "Admin" for staff who aren't tech-savvy. With the header back arrow removed, this becomes the sole path from POS to admin — appropriately buried behind one menu tap since it's rarely needed during a shift. |

### Settings — REMOVED

| Attribute | Value |
|-----------|-------|
| **Purpose** | Navigate to admin settings |
| **Frequency** | Rare — used for configuration changes |
| **Recommendation** | **DECISION: Remove entirely from POS.** Settings is an admin-only function. POS staff (cashiers, detailers) should never need to access system settings during their shift. If a manager needs settings, they can use "Go to Dashboard" → navigate to Settings from there. This follows the principle of least privilege — don't expose admin controls in a front-line interface. |

### Cash Drawer (Proposed — moved from bottom nav)

| Attribute | Value |
|-----------|-------|
| **Recommendation** | **Add to More menu, top position with green dot.** First item in More because it's the most frequently used menu item (1-3x/shift). Green dot indicator preserved for drawer-open status. |

### Theme Toggle (Proposed — moved from header)

| Attribute | Value |
|-----------|-------|
| **Recommendation** | **Add to More menu as segmented control.** Compact 3-button row (Light/Dark/System). Grouped with other appearance/preference items. |

### Keyboard Shortcuts (Proposed — moved from header)

| Attribute | Value |
|-----------|-------|
| **Recommendation** | **Add to More menu.** Discoverable path for new users; power users use `?` key. |

### PWA Refresh (Proposed — moved from header)

| Attribute | Value |
|-----------|-------|
| **Recommendation** | **Add to More menu, conditional on PWA standalone mode.** App maintenance action. |

### Fullscreen (Proposed — moved from header)

| Attribute | Value |
|-----------|-------|
| **Recommendation** | **Add to More menu, conditional on desktop browser.** Display preference. |

### Log Out (Proposed — moved from bottom nav)

| Attribute | Value |
|-----------|-------|
| **Recommendation** | **Add to More menu, last item, red text, with employee initials badge.** Destructive action buried at bottom of menu. Visual warning (red) prevents accidental taps. Initials badge confirms who's logging out. |

---

## SUMMARY: Before vs After

### Header: 16 elements → 7 elements (56% reduction)

| Kept | Removed | Reason |
|------|---------|--------|
| Employee first name (LEFT) | Back arrow | Redundant — Sale tab + "Go to Dashboard" in More |
| Role badge (LEFT) | Recent Transactions dropdown | Redundant with Transactions tab |
| Brand text (CENTER) | PWA Refresh button | Rare → More menu |
| Scanner indicator (RIGHT) | Fullscreen Toggle | Rare → More menu |
| Card Reader status (RIGHT) | Theme toggle (3 buttons) | Rare → More menu |
| Held Tickets badge (RIGHT) | Shortcuts ? button | Rare → More menu |
| Offline Queue badge (RIGHT) | Clock | Redundant — device status bar shows time |

### New Header Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Nayeem (Manager)    Smart Detail POS    [Scanner] [Reader] [Held] [Offline] │
└──────────────────────────────────────────────────────────────────────────────┘
     Left (identity)      Center (brand)              Right (status)
```

### Bottom Nav: 6 slots → 5 slots (evenly spaced across full width)

| Before | After | Change |
|--------|-------|--------|
| Log Out | **Sale** | Most-used screen replaces least-used action |
| Register | Jobs | Cash Drawer to More; Jobs moves up |
| Transactions | Quotes | Same |
| Quotes | Transactions | Same |
| Jobs | **More** (expanded) | More absorbs 7 items |
| More (2 items) | *(removed slot)* | |

### New Bottom Nav Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Transactions  │    Quotes    │     Sale     │     Jobs     │     More      │
│  🧾            │  📄          │  🛒 (center) │  📋          │  ···          │
└──────────────────────────────────────────────────────────────────────────────┘
  5 slots spread evenly across full footer width — Sale in center position
```

### More Menu: 2 items → 7 items (properly utilized)

| Item | Source | Frequency |
|------|--------|-----------|
| Cash Drawer (+ green dot) | Bottom nav "Register" | Occasional |
| Theme toggle (segmented) | Header (3 buttons) | Rare |
| Refresh App (PWA only) | Header | Rare |
| Fullscreen (desktop only) | Header | Rare |
| Keyboard Shortcuts | Header "?" | Rare |
| Go to Dashboard | Was "Go to Admin" in More | Rare |
| Log Out (red, with initials) | Bottom nav slot #1 | Rare |

**Removed from More:** Settings (admin-only — access via Dashboard if needed)

### Dead Code Cleanup

Files to delete entirely:
- `recent-transactions-dropdown.tsx` — fully redundant with Transactions tab
- `fullscreen-toggle.tsx` — logic inlined into More menu
- `pwa-refresh-button.tsx` — logic inlined into More menu
- PinScreen/lock screen related code removed from pos-shell

### Lock Screen: Removed

The PinScreen lock overlay is removed entirely. Session security is handled by the POS Idle Timeout setting (Admin > Settings), which auto-logs out after inactivity. Will be set to ~5 minutes in production (currently 90 min for testing). This simplifies the UX — no PIN re-entry interruptions during a shift, just a clean auto-logout when the device is left idle.

### Touch Target Fixes: 5 violations → 0

All interactive elements meet 44x44px minimum.

---

## Key Design Principles Applied

1. **Fitts's Law**: Most-used items in most-reachable positions (Sale tab = slot #1, bottom nav)
2. **Progressive disclosure**: Rare actions behind one menu tap (More), frequent actions always visible
3. **No redundancy**: Each function has exactly one path (removed Recent Txns dropdown, clock, back arrow, Settings)
4. **Industry alignment**: Matches Square/Toast/Clover patterns for logout, cash drawer, theme, and primary tab placement
5. **Apple HIG compliance**: All touch targets >= 44px, 5 bottom nav tabs (within 3-5 recommendation), evenly spaced
6. **Ambient awareness**: Status indicators (reader, offline, held tickets, drawer) remain visible without interaction
7. **Destructive action protection**: Logout buried in menu with red visual warning
8. **Least privilege**: Settings removed from POS — admin functions stay in admin
9. **Auto-timeout over lock screen**: Simpler UX, same security outcome via idle auto-logout

# iPad POS Optimization

> **Status:** Planned — requires detailed planning before implementation
> **Parent Document:** See [`PROJECT.md`](./PROJECT.md) Phase 12

## Overview

This document captures all planned iPad-specific optimizations for the POS system. These features aim to make the POS feel like a native iPad app with improved usability, touch ergonomics, and offline resilience.

---

## Features

### 1. Larger Touch Targets (44px minimum)

**Goal:** Meet Apple Human Interface Guidelines for touch targets.

**Scope:**
- All buttons, icons, and interactive elements must have minimum 44x44px touch area
- Audit all POS components for undersized targets
- Focus areas: navigation tabs, cart item actions, quantity controls, dialog buttons

**Implementation Notes:**
- May require padding/margin adjustments without changing visual size
- Use `min-h-11 min-w-11` (44px) Tailwind classes or equivalent
- Test on actual iPad hardware

---

### 2. Numeric Keyboard for Quantity Fields

**Goal:** Show number pad instead of full keyboard when entering quantities.

**Scope:**
- All quantity input fields in POS
- Custom amount inputs
- Cash tendered input
- Tip custom amount input

**Implementation:**
- Add `inputMode="numeric"` to relevant `<input>` elements
- Verify behavior on iOS Safari/iPad

**Files to Update:**
- Cart item quantity inputs
- Custom item amount input
- Cash payment tendered field
- Tip custom amount field
- Any other numeric-only inputs in POS

---

### 3. Sticky Cart Sidebar

**Goal:** Keep cart visible at all times without scrolling.

**Scope:**
- Cart/ticket panel should remain fixed on screen
- Product/service grid scrolls independently
- Cart totals always visible

**Implementation Notes:**
- Requires layout restructure with CSS `position: sticky` or split-pane layout
- Consider different behaviors for portrait vs landscape orientation
- Test with long item lists to ensure scroll behavior is correct

---

### 4. PWA with Offline Support

**Goal:** POS functions without internet and syncs when reconnected.

**Scope:**
- Progressive Web App manifest (`manifest.json`)
- Service worker for caching
- Offline data storage (IndexedDB or localStorage)
- Sync queue for pending transactions
- Conflict resolution strategy

**PWA Requirements:**
```json
{
  "name": "Smart Detail POS",
  "short_name": "POS",
  "display": "standalone",
  "orientation": "landscape",
  "theme_color": "#000000",
  "background_color": "#ffffff"
}
```

**Meta Tags:**
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

**Offline Capabilities:**
- Cache product/service catalog for offline browsing
- Queue transactions when offline, sync on reconnect
- Show offline indicator in UI
- Handle payment failures gracefully (cash only when offline?)

**Planning Required:**
- Define what can/cannot work offline
- Determine sync conflict resolution (last-write-wins vs manual resolution)
- Stripe Terminal behavior when offline
- How long to retain offline queue

---

### 5. Quick "New Customer" Inline Form

**Goal:** Create new customer without leaving checkout flow.

**Scope:**
- Inline customer creation form in customer lookup
- Minimal required fields (phone, name)
- Optional fields collapsed/expandable
- Customer created and immediately attached to ticket

**Current Flow:**
1. Search customer
2. Not found → must go to admin to create
3. Return to POS and search again

**Target Flow:**
1. Search customer
2. Not found → "Add New" button appears
3. Inline form: phone (required), first name, last name, email (optional)
4. Submit → customer created and attached to ticket
5. Continue checkout

---

### 6. Recent Transactions Shortcut

**Goal:** Quick access to recent transactions for reprints/refunds.

**Scope:**
- Quick-access panel or button in POS header
- Shows last 5-10 transactions
- One-tap to open transaction detail
- Actions: reprint receipt, start refund

**UI Options:**
- Dropdown in header (clock icon or receipt icon)
- Slide-out panel
- Modal with recent list

---

### 7. Swipe-to-Delete on Cart Items

**Goal:** Intuitive gesture for removing items from cart.

**Scope:**
- Swipe left on cart item reveals delete button
- Swipe further to auto-delete
- Animation for feedback
- Undo option (toast with undo action)

**Implementation Options:**
- Use `react-swipeable` or similar library
- Custom touch handlers with CSS transforms
- Test on iOS Safari for gesture conflicts

---

### 8. Dark Mode

**Goal:** Reduce eye strain in different lighting conditions.

**Scope:**
- System preference detection (`prefers-color-scheme`)
- Manual toggle in POS settings
- Persist preference per device
- All POS screens adapted

**Implementation Notes:**
- Requires design system changes (CSS custom properties for colors)
- Tailwind `dark:` variant throughout POS components
- Consider high-contrast mode for outdoor use
- Receipt preview should remain light (matches printed output)

**Planning Required:**
- Color palette for dark mode
- Which components need special handling
- Toggle UI placement (settings? header?)

---

## Planning Requirements

Before implementation, the following planning steps are required:

### 1. Component Audit
- Inventory all POS components with touch targets
- Identify all numeric input fields
- Document current layout structure

### 2. Offline Strategy
- Define offline capabilities scope
- Design sync queue data structure
- Plan conflict resolution
- Determine Stripe Terminal offline behavior

### 3. Design Work
- Dark mode color palette
- Swipe gesture animations
- New customer inline form design
- Recent transactions panel design

### 4. Technical Decisions
- Service worker caching strategy
- IndexedDB schema for offline data
- Gesture library selection
- State management for offline queue

---

## Implementation Order (Suggested)

| Order | Feature | Complexity |
|-------|---------|------------|
| 1 | Numeric keyboard (`inputMode`) | Low |
| 2 | Larger touch targets | Low-Medium |
| 3 | Swipe-to-delete | Medium |
| 4 | Sticky cart sidebar | Medium |
| 5 | Quick "New Customer" form | Medium |
| 6 | Recent transactions shortcut | Medium |
| 7 | PWA + offline support | High |
| 8 | Dark mode | High |

---

## Success Criteria

- POS feels native on iPad (no browser chrome when launched from home screen)
- All touch targets pass 44px minimum
- Staff can complete basic transactions when WiFi drops briefly
- Dark mode available for evening/outdoor use
- Cart always visible during product browsing
- New customers can be added in < 10 seconds without leaving POS

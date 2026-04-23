# Scanner Hook Rewrite — Audit & Design (Session 42F)

> Status: **Audit only — no code changes in this session.** This document drives
> the follow-on sessions `42F-rewrite` (implementation) and `42F-migration`
> (consumer-site cleanup).
>
> Scope: `src/lib/hooks/use-barcode-scanner.ts` plus all its call sites and the
> ad-hoc opt-out attributes (`data-barcode-scan-target`, `data-qty-edit-input`,
> `data-barcode-target`) currently acting as workarounds.

---

## 0. Executive Summary

### What broke (the motivating bug)

Typing a phone number into the POS customer-lookup dialog produces
**reordered characters** and a **caret stuck at position 0**. The buggy
interaction is between three things:

1. `useBarcodeScanner`'s document-level capture listener, which
   `preventDefault`s every printable keystroke, buffers chars, and later
   re-dispatches the accumulated buffer as a single synthetic `input` event
   (the "release-as-typing" path).
2. The `releaseAsTyping` helper reads `selectionStart`/`selectionEnd` at
   **release time**, not at the time each keystroke was pressed.
3. The customer-lookup input runs `formatPhoneInput(value)` inside its
   `onChange`. Each synthetic `input` event the hook dispatches triggers a
   React state update with a reformatted value; the next batch's
   `selectionStart` is read on an input whose DOM value has already been
   overwritten by React's controlled reconciliation, often landing the
   caret at position 0.

Session 42D-interlude added a **reactive opt-out** (`data-barcode-scan-target="input"`)
so focused inputs could bypass the hook entirely. That ships the bug out the
door for one input at a time. The root cause remains: the hook treats every
keystroke as "guilty until proven innocent" and tries to retroactively
reclaim keystrokes it shouldn't have taken.

### Why "observe, don't capture"

The right architecture is the inverse:
- **Observe** every keystroke passively — no `preventDefault`, no
  `stopPropagation`, no buffering that blocks native input behavior.
- **Detect** scan bursts post-hoc via inter-key timing.
- **Intervene** only when a scan is actually detected — and only to clean up
  the stray chars the user never intended to type, and to suppress form
  submission on the terminating Enter.

This matches the contract used by mature libraries like
[`onscan.js`](https://github.com/axenox/onscan.js) and
[`react-scanner-hook`](https://www.npmjs.com/package/react-scanner-hook). It
eliminates the caret/ordering fight with React controlled inputs entirely
because the hook never synthesizes input events during normal typing.

### Deliverable sequence

| Session | Scope |
|---------|-------|
| **42F-audit** (this doc) | Design + inventory. No code. |
| **42F-rewrite** | Replace `use-barcode-scanner.ts` internals. Hook API unchanged for easy migration. Rewrite the test file. |
| **42F-migration** | Remove ad-hoc opt-out attributes (`data-barcode-scan-target`, `data-qty-edit-input`) at consumer sites. Add a single new `data-scan-consumer` attribute to the Quick Edit Barcode field. Verify 5 call sites. |

### The open question for the reviewer

If the hardware-timing measurements (Phase 2, requires user's scanners)
show a fast typist's keystrokes overlapping the scanner's inter-key gap
profile, the design pivots. Flagged in §3d — please run the measurements
before implementation begins.

---

## 1. Phase 0 — Current Hook Behaviour

Full source in **Appendix A**. Labeled code paths:

| # | Code path | Lines | Purpose |
|---|-----------|-------|---------|
| A | Document-level keydown listener (capture phase) | 149 | `document.addEventListener('keydown', handleKeyDown, { capture: true })` — runs before any descendant listener. |
| B | Speculative `preventDefault` path | 128–132 | Single-char printable keys are always `preventDefault`'d + `stopPropagation`'d so they can't land in the focused input. |
| C | Buffer accumulation | 132 | `bufferRef.current += e.key` — grows until Enter or release timer. |
| D | Enter-key scan-dispatch path | 110–125 | Clears timer, reads buffer, runs min-length + target-attribute gate, fires `onScan`, emits `pos-scanner-detected` window event. |
| E | Release-as-typing timer fallback | 134–146 + 61–88 | After `maxKeystrokeGap` (default 150 ms) of no new keys and no Enter, re-dispatches the buffered chars into the focused input via native-setter-plus-`input`-event. Reads `selectionStart` at release time. |
| F | `isScanTargetInput()` early-return (42D-interlude) | 90–108 | If focused element has `data-barcode-scan-target="input"`, hook bypasses entirely — keystrokes flow natively, buffer is cleared. |
| G | Cleanup on unmount | 150–154 | Removes the document listener and clears the release timer. |

### Known-good behaviours (must be preserved)

1. First-char-of-burst suppression: the first key of a scan never becomes
   visible in any focused input (regression guarded by test
   `use-barcode-scanner.test.ts:76`).
2. USB + Bluetooth scanner support via inter-key gap tuning.
3. The `data-barcode-target` attribute gates which inputs are *allowed* to
   be scan-dispatched. (Line 116 — distinct from path F.)
4. Page-level `enabled` gate lets consumers disable the hook during locked /
   loading / modal-conflict states.
5. `pos-scanner-detected` window event so interested consumers (search bar,
   etc.) can clear their own state after a scan resolves.

### Latent defects (the actual bugs)

1. **Caret position is read at release time**, not at keystroke time.
2. **Controlled inputs that transform value on change** (phone, currency,
   SKU-uppercasing, etc.) rewrite the DOM value between the hook's buffered
   keystrokes and its release-time read. The restore is wrong whenever the
   transformation is not a pure append.
3. **Multi-char human typing** is re-dispatched as a single `input` event.
   React sees one change rather than N. IME handling, cursor animations,
   and per-char side effects (debounced API calls) all get lost or batched
   incorrectly.
4. **`stopPropagation` in capture** prevents React Portals / Radix Dialog
   trap-focus / global keybinding listeners from ever observing the
   keystroke. This is load-bearing for the hook's current design (must not
   leak), but it means any other document listener becomes unreachable
   when the hook is mounted.
5. **Session 42D-interlude workaround** requires every problem-prone input
   to be labeled with `data-barcode-scan-target="input"` individually —
   unscalable. One forgotten input = one new bug.

---

## 2. Phase 1a — Every `useBarcodeScanner` Call Site

Five consumers. All use the hook via `import { useBarcodeScanner } from '@/lib/hooks/use-barcode-scanner'`.

### 1. POS Sale / Register workspace
**File:** `src/app/pos/components/pos-workspace.tsx:10,142`

```ts
useBarcodeScanner({
  onScan: handleBarcodeScan,   // product barcode-lookup → ADD_PRODUCT to ticket
  enabled: !locked,            // reactive: disabled while POS overlay lock is active
});
```

- Parameters: `requireTargetAttribute` defaults to `true`; `minLength` = 4;
  `maxKeystrokeGap` = 150 ms.
- `onScan` calls `/api/pos/products/barcode-lookup`, adds the returned
  product to the current ticket via the ticket-context reducer.
- `enabled` is tied to `usePosAuth().locked` — when the idle-lock overlay is
  open, scans are ignored.
- This hook fires at document level while **dialogs inside the same tree
  are also open** (customer-lookup, vehicle-selector, customer-create,
  vehicle-create, service-detail, manager-pin). That's how a phone number
  typed into the customer-lookup dialog lands in the bug path.

### 2. POS Quote builder
**File:** `src/app/pos/components/quotes/quote-builder.tsx:12,189`

```ts
useBarcodeScanner({ onScan: handleBarcodeScan });
```

- Default options only (all gates active).
- `onScan` calls the same `/api/pos/products/barcode-lookup` endpoint,
  then `handleAddProduct(product)` into the quote ticket.
- No `enabled` gate — hook is mounted whenever the quote builder is
  rendered. There is no locked state here.

### 3. POS Transaction list (receipt lookup)
**File:** `src/app/pos/components/transactions/transaction-list.tsx:11,131`

```ts
useBarcodeScanner({ onScan: handleReceiptScan });
```

- Default options only.
- `onScan` calls `/api/pos/transactions/search?q=...` and routes to a
  receipt detail view on exact/unique match.
- Visible search input at line 247–259 carries `data-barcode-target` so
  the onScan gate passes even when the search input is focused.

### 4. Admin inventory count detail (Session 42D-2)
**File:** `src/app/admin/inventory/counts/[id]/page.tsx:15,165`

```ts
useBarcodeScanner({
  requireTargetAttribute: false,
  enabled: count?.status === 'active' && !loading && !acting,
  onScan: async (barcode) => { /* blur qty-edit input, lookup, increment */ },
});
```

- `requireTargetAttribute: false` — burst bursts fire regardless of what is
  focused. Intentional: the page has no dedicated scan target.
- `enabled` is tripled-gated: only when status is `active` AND data has
  loaded AND no status-transition action is in flight.
- The `onScan` handler defensively blurs any focused element carrying
  `data-qty-edit-input="true"` before running the scan, so an in-progress
  manual-qty edit commits via its `onBlur` handler first.

### 5. Admin catalog products list (Session 41 Quick Edit)
**File:** `src/app/admin/catalog/products/page.tsx:36,83`

```ts
useBarcodeScanner({
  requireTargetAttribute: false,
  onScan: async (barcode) => { /* lookup → open Quick Edit drawer */ },
});
```

- `requireTargetAttribute: false` — any burst opens the Quick Edit drawer
  for the matching product.
- No `enabled` gate — always on when this page is mounted.
- The Quick Edit drawer's Barcode input (`quick-edit-drawer.tsx:326`) wears
  `data-barcode-scan-target="input"` so re-scanning inside the drawer
  doesn't bounce back up and reopen the drawer with a different product.
  This is the single most load-bearing usage of the 42D-interlude opt-out.

### Tests (not a consumer, but references the hook)

- `src/lib/hooks/__tests__/use-barcode-scanner.test.ts` — 12 tests across
  two describe blocks. Covers first-char leak, rapid-burst scan dispatch,
  multi-char human typing release, the 42D-interlude `data-barcode-scan-target`
  early-return.
- `src/app/admin/inventory/counts/__tests__/detail-page.test.tsx:33` — mocks
  `useBarcodeScanner` as a passthrough stub; exposes the page's `onScan`
  as a direct callable in tests.

---

## 3. Phase 1b — POS Input Surfaces (typing surfaces at risk)

The POS hook (pos-workspace + quote-builder) is mounted at the page level
and listens at `document` while all of these inputs can be focused. Every
one is an "incidental input that must not break" unless marked otherwise.

| Component | File | Inputs (purpose) | Opt-out present? | Inside dialog/modal? | Hook ancestor |
|---|---|---|---|---|---|
| **Customer lookup** | `customer-lookup.tsx:108–123` | 1× phone/name search (type=text, inputMode=numeric, formatPhoneInput) | **No** ← motivating bug | Yes (Customer Lookup Dialog, opened from ticket-panel) | pos-workspace |
| POS search bar | `search-bar.tsx:81–104` | 1× global product search | `data-barcode-target` (opt-in, not opt-out) | No, always on screen | pos-workspace |
| Ticket discount | `ticket-panel.tsx:549–553` | 1× amount (text + inputMode decimal/numeric) | No | No (popover) | pos-workspace |
| Ticket item row qty / price / notes | `ticket-item-row.tsx:237–334` | qty, price, notes (3 inputs per row) | No | No | pos-workspace |
| Keypad tab (custom line item) | `keypad-tab.tsx:69` | 1× name | No | No | pos-workspace |
| Register tab manual entry | `register-tab.tsx:302` | 1× misc | No | No | pos-workspace |
| Shop use dialog | `shop-use-dialog.tsx:123,197,230` | reason, qty, notes | No | Yes (dialog) | pos-workspace |
| Customer create dialog | `customer-create-dialog.tsx:251,267` | phone (type=tel), email | No | Yes (dialog) | pos-workspace |
| Customer complete profile dialog | `customer-complete-profile-dialog.tsx:147` | email | No | Yes (dialog) | pos-workspace |
| Vehicle create dialog | `vehicle-create-dialog.tsx:233` | year (inputMode numeric) | No | Yes (dialog) | pos-workspace |
| Receipt options | `receipt-options.tsx:267,290` | email, phone | No | Yes (dialog) | pos-workspace |
| Coupon input | `coupon-input.tsx` | coupon code | No | No | pos-workspace |
| Loyalty panel | `loyalty-panel.tsx:130` | redeem amount | No | No (inline panel) | pos-workspace |
| Cash payment | `cash-payment.tsx:231` | amount (inputMode decimal) | No | Yes (checkout overlay) | pos-workspace |
| Check payment | `check-payment.tsx:127` | check # | No | Yes (checkout overlay) | pos-workspace |
| Split payment | `split-payment.tsx:292` | amount | No | Yes (checkout overlay) | pos-workspace |
| Tip screen | `tip-screen.tsx:95` | tip amount | No | Yes (checkout overlay) | pos-workspace |
| EOD cash count | `eod/cash-count-form.tsx:104` | cash counts | No | No | (end-of-day/page — **not** a scanner consumer) |
| Quote item row qty / price / notes | `quotes/quote-item-row.tsx:188,268` | qty, price, notes | No | No | quote-builder |
| Quote ticket discount | `quotes/quote-ticket-panel.tsx:597` | amount | No | No | quote-builder |
| Quote coupon input | `quotes/quote-coupon-input.tsx` | coupon | No | No | quote-builder |
| Quote list search | `quotes/quote-list.tsx:153` | search | No | No | (list, no scanner) |
| Transaction list search | `transactions/transaction-list.tsx:247` | receipt search | `data-barcode-target` (opt-in) | No | transaction-list |

**Observation — the bug is near-universal.** Only two inputs (the POS
search bar and the transaction-list search) explicitly opt into scan
dispatch. Every other input is silently at risk for the release-as-typing
reorder/caret bug when any multi-char burst happens faster than 150 ms.
The motivating report was customer-lookup; it is plausible the same bug
exists in 15+ other places but has been masked because those inputs don't
apply character-reordering transformations on change (formatPhoneInput is
the accelerant).

---

## 4. Phase 1c — Admin Surfaces Where the Hook Mounts

Only two admin pages mount `useBarcodeScanner`. Every other admin input is
out of scope (hook not present).

### Admin products list — `src/app/admin/catalog/products/page.tsx`

| Input | Category |
|---|---|
| Page-level product search (via `useTableState`) | Incidental — must not break |
| Quick Edit drawer — Barcode | **Intentional scan target** (wears `data-barcode-scan-target="input"` opt-out) |
| Quick Edit drawer — Price / Cost / Stock etc. | Incidental |
| Adjust Stock dialog — qty / reason | Incidental (dialog) |

### Admin inventory count detail — `src/app/admin/inventory/counts/[id]/page.tsx`

| Input | Category |
|---|---|
| Search box (`type="search"`, line 473) | Incidental — the test at `detail-page.test.tsx:428` asserts this input does **not** wear `data-barcode-scan-target` |
| Inline qty-edit (`data-qty-edit-input="true"`, line 581) | Scan-interacting — the `onScan` handler blurs this input first so its `commitEdit` runs before the scan's own POST |
| Confirm-dialog content (move to review / commit / cancel) | No inputs |

---

## 5. Phase 1d — `data-*` Attribute Inventory

Three attributes currently act as ad-hoc opt-ins/-outs. The rewrite's
success criterion is **remove all three**, or reduce to one well-defined
attribute.

### `data-barcode-target` (onScan-opt-in gate)

Consulted at `use-barcode-scanner.ts:116`. Only fires `onScan` when the
focused element carries this attribute (unless `requireTargetAttribute:
false`).

| Location | Why |
|---|---|
| `src/app/pos/components/search-bar.tsx:83` | Lets POS search input receive scan dispatch. |
| `src/app/pos/components/transactions/transaction-list.tsx:249` | Lets receipt-search input receive scan dispatch. |
| `src/lib/hooks/__tests__/use-barcode-scanner.test.ts:18` | Test helper sets it on the installed test input. |

### `data-barcode-scan-target="input"` (hook bypass, Session 42D-interlude)

Consulted at `use-barcode-scanner.ts:94`. When present on the focused
element, the hook returns early — no buffering, no preventDefault, no
onScan. Keystrokes flow natively.

| Location | Why |
|---|---|
| `src/app/admin/catalog/products/components/quick-edit-drawer.tsx:326` | Barcode field in the drawer. Staff rescan here to change the product's stored barcode — must land as typing, must NOT re-trigger the page-level scanner. |
| `src/components/ui/__tests__/search-input.test.tsx:69,73` | Test that SearchInput forwards arbitrary `data-*` props. |
| `src/lib/hooks/__tests__/use-barcode-scanner.test.ts:248,279` | 42D-interlude regression tests. |
| `src/app/admin/inventory/counts/__tests__/detail-page.test.tsx:428–434` | Regression test that the count-detail search input does **not** wear the attribute (so it can still typesafely be used for manual search within a scan-ready page). |

### `data-qty-edit-input="true"` (consumer-side interaction flag)

Consulted only by the inventory count page's own `onScan` handler
(`page.tsx:177`), not by the hook. Marks the inline qty-edit input so a
scan triggered mid-edit can first blur it and commit the edit before the
scan's own POST runs.

| Location | Why |
|---|---|
| `src/app/admin/inventory/counts/[id]/page.tsx:581` | Inline qty-edit `Input`. |
| `src/app/admin/inventory/counts/__tests__/detail-page.test.tsx:452` | Regression test. |

This one is **not load-bearing on the hook's behaviour** — it's a
page-local coordination flag. It can stay as-is through the rewrite
because the hook doesn't care about it.

---

## 6. Phase 2 — Hardware Timing Profile (Awaiting User)

The new architecture's scan-detection threshold must be chosen to land
reliably **above fast human typing** but **below the slowest Bluetooth
scanner emit rate**. We don't yet know where those two distributions sit
in this shop's hardware. Run the measurements and paste results below
before 42F-rewrite begins.

### Test procedure

1. Open any admin page in dev mode. Paste this one-liner into DevTools
   Console to attach a lightweight timing logger:

   ```js
   (() => {
     const log = [];
     window.__scanLog = log;
     document.addEventListener('keydown', (e) => {
       log.push({ k: e.key, t: performance.now() });
     }, { capture: true });
     console.log('Logging. Run window.__scanLog to see, window.__scanLog.length to count.');
   })();
   ```

2. Focus any text input. Run each scenario in isolation. Between scenarios
   run `window.__scanLog.length = 0` to reset.

3. After each scenario, compute inter-key gaps with:

   ```js
   window.__scanLog.slice(1).map((r, i) => Math.round(r.t - window.__scanLog[i].t))
   ```

### Scenarios + measured data

Measurements run 2026-04-22 on MBP with BT scanner paired directly.

**Test A — BT scanner, 12-digit barcode**
- Gaps: `[7, 1, 7, 1, 8, 10, 7, 8, 27, 6, 0, 8]` ms
- min: **0 ms** | max: **27 ms** | median: **7 ms**

**Test B — Fast typing `0123456789`**
- Gaps: `[144, 187, 185, 241, 177, 217, 209, 296, 401]` ms
- min: **144 ms** | max: **401 ms** | median: **209 ms**

**Test C — Slow-deliberate typing (Backspace + `0123456789`)**
- Gaps: `[1906, 790, 672, 994, 667, 876, 578, 694, 772, 890]` ms
- min: **578 ms** | max: **1906 ms** | median: **790 ms**

### Decision

**Threshold locked 2026-04-22:**
- `scanBurstMs = 50 ms`
- `snapshotGapMs = 300 ms`

Scanner max (27 ms) vs typing min (144 ms) = **117 ms clean empty band**.
No overlap, no fallback strategy needed. The 50 ms threshold is above the
scanner max (27 ms + margin) and well below fast-typing min (144 ms).
The 300 ms snapshot gap is above the scanner's total burst duration
(~100 ms for 12 chars) and below slow-typing min (578 ms), correctly
marking "new burst window" without capturing mid-typing snapshots.

---

## 7. Phase 3 — New Architecture: Observe-Don't-Capture

### 7a. Option analysis

Four candidate architectures were considered. Each is evaluated against
these criteria:
- Does it fix the customer-lookup reorder/caret bug?
- Does it remove the need for per-input opt-out attributes?
- Does it keep working for all 5 current consumers?
- Does it introduce new failure modes?

**Option A — "Let chars land, clean up on detect."**
Passive listener at document level (no `preventDefault` on printable keys).
Every key lands in the focused input natively. When a timing burst is
detected and terminated by Enter: `preventDefault` the Enter only, fire
`onScan`, and restore the focused input to its pre-burst snapshot. No
`stopPropagation`.

- ✅ Fixes the caret/reorder bug because typing flows natively through
  React's normal controlled-input path.
- ✅ Removes the need for `data-barcode-scan-target="input"` (hook bypass)
  because nothing is being blocked in the first place.
- ⚠️ Scanned chars briefly appear in the input before being cleaned up.
  Visible for one frame at typical render rates; acceptable (see §7d risk
  R-2).
- ⚠️ Needs a focused-input snapshot taken when the burst begins so the
  restore is exact (handles inputs with change-time transformations like
  phone formatting).

**Option B — "Delay commit."**
Same as current hook. Preserves the bug. Rejected.

**Option C — "Input-type aware capture."**
Listener inspects `document.activeElement` on each keydown and only
preventDefaults when the focused element is not a text input.

- ✅ Simpler than Option A in the common case.
- ❌ Still requires marking "scan-intent" inputs so they don't double-fire.
  Replaces one attribute with another.
- ❌ What if the burst starts with no focus and lands on an input
  mid-burst? State machine gets ugly.

**Option D — "Context-aware mount."**
A `<ScannerProvider>` wraps the tree and exposes `<ScannerTarget>` vs
`<TypingSurface>` components. Hook reads context to know whether to
capture.

- ✅ Most principled architecturally.
- ❌ Requires instrumenting every input in the app with a context
  wrapper. Same maintenance burden as the current opt-out attribute, just
  spelled differently.
- ❌ Breaks with third-party inputs (Radix, Dialog portals, native
  elements).

### Pick: Option A

Chosen for the fix-to-complexity ratio. The single remaining edge case
(scan-consumer inputs that want the chars kept — Quick Edit Barcode field)
is handled with **one** opt-in attribute (`data-scan-consumer`), replacing
the current two-attribute ad-hoc system.

### 7b. Core algorithm

```
State:
  log: RingBuffer<{ key, timestamp }>, capped at maxBarcodeLength + 8 entries
  snapshot: { el, value, selectionStart, selectionEnd } | null

On keydown (passive; no preventDefault, no stopPropagation):
  1. If not enabled, bail.
  2. If key is a modifier/arrow/function key (length !== 1 && key !== 'Enter'), bail.
  3. If key !== 'Enter':
       gap = now - (last log entry's timestamp || Infinity)
       If gap > SNAPSHOT_GAP_MS (generous — say 300ms) and no active snapshot:
         snapshot = capture(activeElement)   // we might be starting a burst
       append { key, timestamp: now } to log
       return
  4. Key === 'Enter':
       Walk log backwards. Find the longest contiguous tail where
       every adjacent pair has (gap < SCAN_BURST_MS) AND length >= minLength.
       If found → scan-detected path. Else → typing-terminated-by-Enter path.

Scan-detected path:
  a. preventDefault(Enter). Do NOT stopPropagation.
     (Prevents accidental form submission; leaves other handlers alone.)
  b. Compose barcode = tail.map(k => k.key).join('').trim()
  c. Reset log and snapshot.
  d. If focused element is a text-input-like element AND carries
     data-scan-consumer (opt-in for Quick Edit Barcode field):
       - Chars stay in the input (no restore).
       - Do NOT dispatch pos-scanner-detected.
       - Do NOT call onScan.
       - Return — the scan-consumer has "consumed" the scan by letting
         the chars land; no page-level handler should fire.
  e. Else, if focused element is a text-input-like element:
       Restore from snapshot — native setter → 'input' event.
  f. Emit window event `pos-scanner-detected`.
  g. Call onScan(barcode).

The scan-consumer early return in step (d) is the Quick Edit drawer
semantics: "Barcode input wants the chars to land; page-level scanner
must not also dispatch (or the drawer would reopen with a different
product)." This matches §10a test 8 and §7e's stated purpose.

Typing-terminated-by-Enter path:
  a. No scan detected. Reset log and snapshot.
  b. Do not preventDefault. Enter flows naturally (form submit, newline,
     useEnterSubmit handler, etc. — all work as they did before the hook
     was mounted).
```

**Why the log + walk design:** we don't know in advance when a burst
starts or ends. A user might type "ab" slowly, then scan "SD-12345", then
type "c" — that's typing-burst-typing within one mounted session. Walking
the tail on Enter lets us detect the scan without also dropping the
surrounding typing.

**Why snapshot on first-key-after-gap (not every key):** the snapshot's
purpose is "what did the input look like before the burst began?" We only
need one. Capturing per-key would be O(N) useless work; capturing only
after gap > SNAPSHOT_GAP_MS gives us exactly one per "session of
activity" and the correct restore target.

**Why no stopPropagation:** the current hook's stopPropagation is what
prevents Radix Dialog, React-Hook-Form, and every form handler from
seeing the Enter. In observe-don't-capture we never want to steal keys
from them. Scans are ours; Enter is theirs — unless the tail just spelled
"SD-006217" in under 200 ms.

### 7c. Snapshot + restore mechanics

```
function capture(el: Element | null): Snapshot | null {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return null;  // contenteditable: separate code path, or unsupported
  }
  return {
    el,
    value: el.value,
    start: el.selectionStart ?? el.value.length,
    end: el.selectionEnd ?? el.value.length,
  };
}

function restore(snap: Snapshot) {
  const { el, value, start, end } = snap;
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter ? setter.call(el, value) : (el.value = value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.setSelectionRange?.(start, end);
}
```

This is effectively the same primitive the current hook uses, but run
once at scan-detection time instead of per-burst at release time. That
one call site is the hook's only synthetic event dispatch — normal typing
never touches it.

### 7d. API proposal

```ts
interface UseBarcodeScannerOptions {
  /** Called when a scan is detected (fast burst + Enter terminator). */
  onScan: (barcode: string) => void;

  /** Hook mounts its listener only when true. Default: true. Reactive. */
  enabled?: boolean;

  /** Minimum chars in the detected burst. Default: 4. */
  minLength?: number;

  /** Max inter-key gap (ms) for chars to count as part of one burst.
   *  Default: 50 (post-measurement; see §6). */
  scanBurstMs?: number;

  /** Used to define "start of a new burst window" — any gap above this
   *  triggers a fresh pre-burst snapshot of the focused input. Should be
   *  comfortably above the slowest scanner (Phase 2 B max) and below the
   *  typical-typing gap. Default: 300. */
  snapshotGapMs?: number;

  // ----- Deprecated, kept for source-compat during 42F-migration -----
  /** @deprecated No-op in the new hook. Kept so call sites don't break
   *  mid-migration. Remove in 42F-migration. */
  requireTargetAttribute?: boolean;

  /** @deprecated Alias for scanBurstMs for one migration window. Remove
   *  in 42F-migration. */
  maxKeystrokeGap?: number;
}
```

Notes:
- `requireTargetAttribute` and the `data-barcode-target` gate are both
  **retired**. Under observe-don't-capture, onScan is gated purely by
  timing. Fast human typing finished with Enter does not look like a scan
  (minLength + scanBurstMs combination) and will not fire onScan.
- `scanBurstMs` replaces the ambiguous `maxKeystrokeGap` name (which
  conflated "burst membership" with "release timer"). Keep
  `maxKeystrokeGap` as an aliased deprecated option so 42F-rewrite and
  42F-migration can ship in separate commits.

### 7e. New attribute: `data-scan-consumer`

Single opt-in attribute replacing `data-barcode-scan-target="input"`.
Meaning: "this input *wants* to receive the scanner's characters as
typed; do not fire onScan and do not restore."

Consumers (exactly one site, the same one that wears the old attribute):

| Location | Reason |
|---|---|
| `src/app/admin/catalog/products/components/quick-edit-drawer.tsx:326` Barcode `<Input>` | Staff rescans here to change the stored barcode. The scan should land as typed text; it must not also open a new drawer for whatever the scanned value looks up to. |

Everywhere else, the attribute is absent → default behaviour (detect +
restore + fire onScan).

---

## 8. Migration Semantics Per Consumer

### pos-workspace (Sale register)

Behaviour change: **none intended.** Customer lookup dialog stops
corrupting typing. All other flows identical.
- Attribute removals: none at this call site. Keep `enabled: !locked`.
- Nothing else to update — the hook's onScan contract is unchanged.

### quote-builder

Behaviour change: **none intended.** Same hook semantics, same endpoint.

### transaction-list

Behaviour change: **subtle.** Old behaviour: onScan fires only if the
focused element has `data-barcode-target`. New behaviour: onScan fires
on any fast-gap Enter-terminated burst anywhere on the page.
- Acceptable for receipt lookup — the page has one purpose.
- Attribute removal: `data-barcode-target` on line 249 can be dropped.
  Doc-comment the deletion.

### admin/catalog/products page

Behaviour change: **minor.** Previously `requireTargetAttribute: false`
meant any Enter with ≥ `minLength` buffered chars fired onScan —
including a barcode manually typed character-by-character. Under the new
timing-based detection, slow-typed Enter no longer dispatches onScan.
Manual barcode entry via keyboard on this page will no longer open the
Quick Edit drawer. Acceptable — manual barcode typing is not a common
workflow here; the Quick Edit drawer itself is available via row click.
- Attribute removal: `data-barcode-scan-target="input"` on the Quick Edit
  drawer Barcode input (line 326) → replace with `data-scan-consumer=""`.
- onScan behaviour unchanged for **actual scans**: lookup → open drawer.

### admin/inventory/counts/[id] page

Behaviour change: **minor.** Same timing-based gate as above — slow-typed
barcode + Enter no longer auto-increments via the scan path. Acceptable:
the page has an inline qty-edit flow for manual corrections; the scan
path exists specifically to handle physical scanner bursts.
- The onScan handler's "blur any `data-qty-edit-input` element first"
  logic is still correct and still needed — that attribute is
  page-local coordination and the new hook doesn't change how it works.
- Attribute removal: none.

### Test updates (part of 42F-rewrite)

The existing hook test file (`use-barcode-scanner.test.ts`) tests the old
speculative-prevent model directly and has to be rewritten for the new
model. New test shape:
- Passive-by-default (assert `defaultPrevented: false` on every non-Enter
  key).
- Timing-based detection (assert onScan fires for fast Enter-terminated
  bursts, does not fire for slow typing).
- Snapshot restore on scan (assert input returns to pre-burst state).
- Non-restoration when `data-scan-consumer` is set.
- Multi-chunk interleave (typing → scan → typing all in one mount).

See §10 for the test plan.

---

## 9. Risk Register

### R-1 — Scanner / typing timing overlap

**Risk:** If a fast typist's min inter-key gap is lower than the slowest
BT scanner's max gap, we cannot choose a single `scanBurstMs` threshold
that cleanly separates them. False positives (typing → onScan) or false
negatives (scan → typing) become possible.

**Mitigation:** Phase 2 measurements must confirm clean separation. If
none, fall back to `minLength: 8` or higher for auto-dispatch AND keep a
deliberately-focused scan target pattern (e.g. the POS search bar's
`data-barcode-target` approach, but as a *dispatch hint* — "if the
focused input wears this, loosen minLength to 4; otherwise require 8").
Do not ship until this is resolved.

### R-2 — One-frame visible flash of scanned chars

**Risk:** Chars land in focused input, then get restored ~10 ms later on
Enter. User sees a flicker.

**Mitigation:** Acceptable. The current hook already causes a flicker
via release-as-typing for human bursts; the new hook's flicker is rarer
(only during actual scans) and shorter (~1 frame). If the flicker is
unacceptable on iPad, we can `el.style.visibility = 'hidden'` during the
burst window and restore on detect — deferred until observed.

### R-3 — Focus changes during burst

**Risk:** User taps a different field mid-scan (rare, but possible with
touch keyboard interruption). Snapshot is on the old focused element;
restore overwrites the wrong thing.

**Mitigation:** On each keydown after the first, verify
`document.activeElement === snapshot.el`. If it changed, invalidate the
snapshot (set to null). Scan still dispatches on Enter; we just don't
restore anything. The new focus target keeps whatever natively landed
(which is fine — chars only landed in it from the moment focus shifted).

### R-4 — Enter never arrives after a burst

**Risk:** Some scanners can be (mis-)configured to not send Enter. The
log grows unbounded.

**Mitigation:** Ring-buffer is capped at `maxBarcodeLength + 8` entries
(e.g. 40). Oldest entries evicted as new keys arrive. No unbounded
growth. A burst with no Enter yields no scan and no restore — matches
current hook's "typing without Enter" behaviour.

### R-5 — Snapshot captured on a non-input focused element

**Risk:** Scanner fires with the body focused. Nothing to snapshot.
Nothing to restore. onScan still fires, which is correct.

**Mitigation:** `capture()` returns `null` for non-input activeElement.
Restore path skips when snapshot is null. Correct by construction.

### R-6 — React strict-mode double-mount causes duplicate listeners

**Risk:** In dev, React 19 strict mode mounts the effect twice. With
stale refs this can leak listeners.

**Mitigation:** useEffect cleanup removes the document listener and
clears state. Ref-based access to `onScan` (already done in current
hook) stays. Adding a ref for `enabled` to avoid remount thrash on
reactive-gate flips.

### R-7 — Global event listeners from MDN / Stripe / Radix compete

**Risk:** The existing hook's `capture + stopPropagation` is load-bearing
against competing document listeners. Dropping it may expose other
handlers that react to Enter/printable keys.

**Mitigation:** Known-quantity — there are no other document-level
keydown listeners in this codebase that preventDefault printable keys.
Verified via `grep -rn "addEventListener\\('keydown'" src/`. Stripe
Terminal SDK uses its own iframe; Radix uses focus traps, not keydown
capture.

### R-8 — iPad on-screen keyboard emits weird key sequences

**Risk:** iPad Safari autocorrect / autocomplete can inject keys that
arrive in a burst even though the user only tapped two keys ("the" →
"the " with rapid synthetic keys).

**Mitigation:** `minLength: 4` (default) plus `scanBurstMs: 50` (once
confirmed by Phase 2) means "the " (length 4, slow-ish) won't dispatch.
Edge cases will surface in manual smoke testing — see §10.

### R-9 — Consumer's onScan handler is async and user scans again fast

**Risk:** Two overlapping onScan calls. No handler is currently built
for concurrency.

**Mitigation:** Unchanged from current hook — same issue exists now. Out
of scope for this rewrite. Flag for a future session if ever observed.

### R-10 — Test file churn masks a regression

**Risk:** Old tests are tuned to old model. Rewriting them wholesale
risks the author accidentally writing tests that pass against a buggy
new hook.

**Mitigation:** The new test file must include **transliterated
counterparts** of the 12 old tests (wherever still applicable under new
semantics) before any new tests are added. Use the old tests' names as a
behaviour checklist.

---

## 10. Test Strategy

### 10a. Unit tests — the hook itself (Vitest + jsdom)

Rewrite `src/lib/hooks/__tests__/use-barcode-scanner.test.ts` with these
blocks:

1. **Passive typing** — each non-Enter key has `defaultPrevented: false`;
   onScan never fires; input receives chars natively.
2. **Fast-burst scan** — 9 chars with 15 ms gaps + Enter → onScan fires
   with the full barcode, Enter is preventDefault'd, focused input
   is restored to pre-burst value.
3. **Slow typing + Enter** — 6 chars with 200 ms gaps + Enter → onScan
   does NOT fire, Enter is NOT preventDefault'd.
4. **Mixed** — 2 slow chars, 8 fast chars, Enter → onScan fires with
   only the fast tail; pre-burst snapshot includes the 2 slow chars;
   input is restored to "(2 slow chars)" not to empty.
5. **minLength respected** — 3 fast chars + Enter → does NOT fire
   onScan (below minLength: 4).
6. **enabled=false** — hook doesn't attach listener; keys all pass
   through; onScan never fires.
7. **enabled flips from true to false mid-burst** — burst discarded;
   onScan not called.
8. **data-scan-consumer** — fast-burst + Enter on an input with the
   attribute: onScan does NOT fire and input is NOT restored.
9. **Focus change mid-burst** — focus moves to a new input after key 3;
   snapshot invalidates; onScan still fires on Enter (detect only); no
   restore attempted.
10. **Non-input focused** — burst while `<body>` has focus: onScan fires;
    no restore (there's nothing to restore).
11. **Ring buffer cap** — send 50 fast chars, no Enter: no runtime
    error, log doesn't grow past cap, next Enter fires onScan with the
    tail only.
12. **Cleanup on unmount** — mounts twice (strict-mode sim); no duplicate
    onScan dispatches.

### 10b. Integration test — customer-lookup no longer reorders

Add a dedicated test at
`src/app/pos/components/__tests__/customer-lookup.test.tsx` that:
1. Renders `<CustomerLookup>` inside a simulated pos-workspace with the
   hook mounted.
2. Types "5551234567" into the input via `userEvent` at human speed
   (50ms between keys).
3. Asserts the input ultimately displays `(555) 123-4567` with the caret
   at the end, no reordered chars.

### 10c. Manual smoke plan (hardware required)

Run after 42F-rewrite ships. Mark each Pass/Fail.

| # | Surface | Action | Pass |
|---|---|---|---|
| 1 | POS Sale — search bar focused | Scan product barcode | Product added to ticket; search clears |
| 2 | POS Sale — customer lookup open | Type 10-digit phone number at normal speed | Number formats as `(___) ___-____` correctly; no reorder |
| 3 | POS Sale — customer lookup open | Scan a 12-digit barcode | onScan fires; lookup dialog stays open and shows phone search results (or nothing); barcode chars do not remain in the phone input |
| 4 | POS Sale — tip screen | Type a tip amount with Enter to submit | Enter submits; onScan does not fire |
| 5 | POS Quote builder | Scan product barcode | Added to quote |
| 6 | POS Transactions | Scan a receipt | Receipt opens |
| 7 | Admin catalog/products | Scan a known barcode | Quick Edit drawer opens |
| 8 | Admin catalog/products Quick Edit | Inside drawer, scan a *different* barcode | New barcode lands in the Barcode field; drawer does NOT replace target product |
| 9 | Admin catalog/products Quick Edit | Type a barcode into the Barcode field manually and blur | Manual save works |
| 10 | Admin inventory count [active] | Scan a product barcode | Counted qty increments by 1 |
| 11 | Admin inventory count [review] | Click a qty cell, type new value, blur | Manual edit commits |
| 12 | Admin inventory count [active] | Click qty cell, start typing, then scan mid-edit | Edit blurs/commits first; then scan increments |
| 13 | iPad BT scanner | All of 1, 2, 3, 5, 6, 7, 10 above | Pass on iPad too |
| 14 | USB scanner | Same | Pass on desktop too |

---

## 11. Rollout Plan

### Session 42F-rewrite

- **Module strategy:** replace `src/lib/hooks/use-barcode-scanner.ts`
  in-place. Hook name stays. Consumers don't need import changes. No
  feature flag.
- **Deprecated options:** `requireTargetAttribute` (no-op) and
  `maxKeystrokeGap` (alias for `scanBurstMs`) stay in the type for one
  session so call sites compile unchanged.
- **Tests:** rewrite `use-barcode-scanner.test.ts` per §10a before any
  manual testing.
- **Single commit:** feat/refactor on the hook + rewritten tests.
  Quality gates: `npm run typecheck`, `npm run test`, `npm run lint`.
- **No consumer changes.** Keeps blast radius to the hook.

### Session 42F-migration

Split into multiple commits for bisectability:

1. Drop `data-barcode-scan-target="input"` from `quick-edit-drawer.tsx`
   and add `data-scan-consumer=""` in its place. Update
   `search-input.test.tsx:69` to use the new attribute. Manually verify
   admin products Quick Edit rescan flow.
2. Drop `data-barcode-target` from `search-bar.tsx:83` and
   `transaction-list.tsx:249`. Drop the `requireTargetAttribute` option
   from all call sites (currently set only at admin/catalog/products
   and admin/inventory/counts — both have `false`). Delete the
   `data-barcode-target` consultation from the hook.
3. Delete deprecated options from the hook's type. Delete
   transliterated-42D tests that no longer apply.
4. Update `docs/dev/CONVENTIONS.md` scanner section if it references the
   old attribute system.
5. Update the comment at the top of `use-barcode-scanner.ts` to describe
   the new model.

### Deploy + smoke order

1. Ship 42F-rewrite to dev. Run unit tests + §10c manual smoke.
2. If all 14 items pass, ship 42F-migration to dev. Rerun §10c (same 14
   items, expect same pass).
3. If any fail, revert 42F-migration only. 42F-rewrite is the load-bearing
   change — keep it or revert both, don't half-revert.

---

## 12. Open Questions for Review

1. **data-scan-consumer name** — happy with that name? Alternatives:
   `data-scanner-owner`, `data-scan-passthrough`. Naming bikeshed, but
   the attribute's lifetime is "forever" since it's load-bearing for
   Quick Edit.
2. **POS search bar's `pos-scanner-detected` event** — keep or remove?
   Currently the search bar listens for it to clear itself after a
   scan. Under the new hook, scans that start focused on the search bar
   would have their chars landed-then-restored natively — the search bar
   effectively self-clears via the restore. The custom event becomes
   redundant. Recommendation: **remove the event dispatch and the
   listener in 42F-migration**; document the removal.
3. **Should the new hook support contenteditable surfaces?** Current
   hook explicitly bails on them. None of the 5 consumers use them. We
   can keep the bail-out for now.
4. **Any other non-consumer pages that might mount the hook in the
   future?** Inventory count *list* page currently does not; planning
   docs for Phase 15 (Store Setup & Hardware) mention receipt-printer
   and copier integration — unlikely to need barcode scanning, but
   flagging so the hook's contract survives new consumers.

**Resolved (2026-04-22):**
- Phase 2 measurements — complete. See §6 Decision. `scanBurstMs=50`,
  `snapshotGapMs=300` locked.
- `scanBurstMs` default — 50 ms confirmed by measurements (scanner max
  27 ms + 23 ms margin; typing min 144 ms).

---

## Appendix A — Full Source of Current Hook

Captured from `src/lib/hooks/use-barcode-scanner.ts` at the time of this
audit. Included verbatim so future readers understand what "current
behaviour" meant when the rewrite began.

```ts
'use client';

import { useEffect, useRef } from 'react';

interface UseBarcodeOptions {
  /** Callback when a barcode is scanned */
  onScan: (barcode: string) => void;
  /** Max time between keystrokes in ms (Bluetooth scanners need ~150ms) */
  maxKeystrokeGap?: number;
  /** Minimum barcode length to consider valid */
  minLength?: number;
  /** Whether scanning is enabled */
  enabled?: boolean;
  /**
   * When true (default), Enter only fires `onScan` if the focused element
   * carries `data-barcode-target`. This prevents the scanner from eating
   * Enter in unrelated inputs (e.g. POS cash/tip fields).
   *
   * Set to false on pages that want any rapid keystroke burst to trigger
   * a scan regardless of focus (e.g. a list view with no dedicated input).
   */
  requireTargetAttribute?: boolean;
}

/**
 * Detects barcode scanner input (keyboard emulation mode).
 * Supports both USB (~10ms/char) and Bluetooth (~60-100ms/char) scanners.
 *
 * Works globally — attaches on `document` regardless of focus.
 *
 * Speculative-prevent strategy: every printable keydown is preventDefault'd
 * immediately and appended to a buffer. A release timer of maxKeystrokeGap
 * is (re)scheduled. If it fires with any buffered characters, they are
 * synthesized into the focused input as human typing. Scan bursts always
 * end with Enter (which clears this timer and dispatches via onScan) well
 * before the release timer can fire, so their characters never leak into
 * the input — including the first char of the burst.
 */
export function useBarcodeScanner({
  onScan,
  maxKeystrokeGap = 150,
  minLength = 4,
  enabled = true,
  requireTargetAttribute = true,
}: UseBarcodeOptions) {
  const bufferRef = useRef('');
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function clearReleaseTimer() {
      if (releaseTimerRef.current !== null) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    }

    function releaseAsTyping(ch: string) {
      const el = document.activeElement as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      if (!el || typeof (el as HTMLInputElement).value !== 'string') return;
      // Contenteditable surfaces don't expose a `value` setter; bail out.
      if ((el as HTMLElement).isContentEditable) return;

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newValue = el.value.slice(0, start) + ch + el.value.slice(end);

      // Native setter + bubbling input event so React's controlled-input
      // onChange handlers fire (React overrides the `value` setter on the
      // instance; we have to call the one on the prototype).
      const proto = Object.getPrototypeOf(el);
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, newValue);
      } else {
        el.value = newValue;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));

      const newCursor = start + ch.length;
      el.setSelectionRange?.(newCursor, newCursor);
    }

    function isScanTargetInput(): boolean {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement &&
        el.getAttribute('data-barcode-scan-target') === 'input'
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Target-override: when the focused input opts in via
      // data-barcode-scan-target="input", bypass the hook entirely and let
      // keystrokes (including Enter) flow natively. Used by the Quick Edit
      // drawer's Barcode field so staff can rescan without the page-level
      // scanner hook reopening the drawer with a different product.
      if (isScanTargetInput()) {
        clearReleaseTimer();
        bufferRef.current = '';
        return;
      }

      if (e.key === 'Enter') {
        clearReleaseTimer();
        const barcode = bufferRef.current.replace(/[\r\n]/g, '').trim();
        bufferRef.current = '';

        const activeEl = document.activeElement;
        const hasTarget = activeEl?.hasAttribute('data-barcode-target') ?? false;
        const gatePass = requireTargetAttribute ? hasTarget : true;
        if (barcode.length >= minLength && gatePass) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(barcode);
          window.dispatchEvent(new Event('pos-scanner-detected'));
        }
        return;
      }

      // Modifiers, arrows, function keys — let them through unchanged.
      if (e.key.length !== 1) return;

      e.preventDefault();
      e.stopPropagation();
      bufferRef.current += e.key;

      clearReleaseTimer();
      releaseTimerRef.current = setTimeout(() => {
        const buf = bufferRef.current;
        bufferRef.current = '';
        releaseTimerRef.current = null;
        // Any buffered keystrokes without a following Enter are human typing,
        // not a scan — re-dispatch them. Scanners always send Enter before
        // this timer fires (the Enter path clears this timer), so only human
        // typing bursts reach here. Dropping them would silently eat input.
        if (buf.length > 0) {
          releaseAsTyping(buf);
        }
      }, maxKeystrokeGap);
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      clearReleaseTimer();
      bufferRef.current = '';
    };
  }, [enabled, maxKeystrokeGap, minLength, requireTargetAttribute]);
}
```

# Star TSP100III Receipt Logo — Troubleshooting & Solution Reference

**Last Updated:** March 5, 2026
**Printer:** Star TSP100III (TSP143) — USB connected to Windows 10 Optiplex
**Emulation Mode:** ESC/POS
**Logo Method:** futurePRNT NV memory + ESC/POS Routing
**Print Path:** Next.js API → HTTP POST → Optiplex print server (Node.js) → `\\localhost\StarTSP100` → printer

---

## The Problem

The receipt printer printed gibberish text or multiple copies of the logo (4x) instead of a single logo at the top of each receipt.

## Hardware & Software Setup

**Physical connection:** Star TSP100III → USB → Windows 10 Optiplex (192.168.1.81)

**Print server:** Node.js Express app at `C:\print-server\server.js` running on port 8080. Receives raw ESC/POS binary via HTTP POST, writes to printer share via `copy /b` to `\\localhost\StarTSP100`.

**Printer share:** The Star printer is shared on Windows as `StarTSP100`. Direct USB port writes (`\\.\\USB003`) do not work for USB printers on Windows — data must go through a Windows printer share.

**futurePRNT Configuration Utility:** Star's driver software that intercepts data going through the printer share. Stores logo in NV (non-volatile) memory and injects it into the receipt stream based on ESC/POS parsing.

**futurePRNT settings that must be enabled:**
- Configuration Utility TSP100 → ESC/POS emulation mode
- Print Job Routing → ESC/POS Routing: **CHECKED**
- Image List → Logo uploaded (BMP/JPG/GIF, 45mm wide recommended)
- Logos & Cropping → Logo added to **Top Image List**, centered

## What We Tried (and Why It Failed)

### Attempt 1: Server-side raster conversion with `sharp`
**Approach:** Fetch logo from Supabase URL on the Hostinger server, convert to monochrome bitmap using `sharp` (Node.js image library), embed Star Line Mode raster commands (`ESC * r A`, `b nL nH`, `ESC * r B`) in the ESC/POS stream.
**Result:** Gibberish text. No logo.
**Why it failed:** The printer is in **ESC/POS emulation mode**, not Star Line Mode. Star Line Mode raster commands (`ESC * r`) are not recognized in ESC/POS mode.

### Attempt 2: Browser Canvas API (star-printer.ts)
**Approach:** Claude Code created a `star-printer.ts` file using browser Canvas API (`document.createElement('canvas')`, `new Image()`) to convert images to Star WebPRNT XML format.
**Result:** Would not compile. Never reached the printer.
**Why it failed:** The code runs on a **Node.js server** — browser APIs like `document`, `canvas`, and `Image` do not exist in Node.js.

### Attempt 3: GS v 0 raster command from print server
**Approach:** Read BMP file locally on the Optiplex, parse pixel data in JavaScript, convert to monochrome 1-bit bitmap, send using standard ESC/POS `GS v 0` raster command (`0x1D 0x76 0x30`).
**Result:** Gibberish text + cash drawer firing repeatedly.
**Why it failed:** The BMP file was 32-bit with BI_BITFIELDS compression (compression type 3). The BMP parser only handled uncompressed BMPs (type 0). The pixel data was read with wrong byte offsets. Additionally, the `0x1D` bytes in the raster command headers triggered futurePRNT's logo injection multiple times.

### Attempt 4: futurePRNT with Star-specific ESC/POS commands
**Approach:** Upload logo via futurePRNT Configuration Utility → Image List → Logos & Cropping. Let futurePRNT inject the logo automatically. Enable ESC/POS Routing.
**Result:** Logo printed 4 times instead of once. Multiple cuts mid-receipt.
**Why it failed:** The ESC/POS stream contained Star-specific commands (`ESC GS a` for alignment, `ESC i` for sizing) that have a `0x1D` (GS) byte embedded. futurePRNT's ESC/POS parser interprets every `0x1D` byte after `ESC @` init as a receipt boundary and inserts the logo at each one.

### Attempt 5: Replace Star commands with standard ESC/POS (GS-prefixed)
**Approach:** Replace Star's `ESC GS a` with standard `ESC a`, Star's `ESC i` with standard `GS !`.
**Result:** Still 4 logos.
**Why it failed:** Standard `GS !` (`0x1D 0x21`) still contains a `0x1D` byte. The problem is ANY `0x1D` byte, not specifically Star commands.

## What Worked (The Solution)

### The Key Discovery

Through systematic binary-level testing, we discovered the exact rule:

**futurePRNT inserts the NV logo at every `0x1D` (GS) byte that appears after an `ESC @` (0x1B 0x40) init command — EXCEPT when the `0x1D` appears at the very end of the data stream (i.e., for the cut command).**

Test results that proved this:

| Stream contents | `0x1D` count | Result |
|---|---|---|
| ESC @ + ESC-only commands (no 0x1D at all) | 0 | No logo, no cut |
| ESC @ + GS ! 0x00 + ESC-only commands | 1 | ONE logo at top, no cut |
| ESC @ + ESC-only commands + GS V cut at end | 1 (at end) | No logo, cut works |
| ESC @ + GS ! 0x00 + ESC-only commands + GS V | 2 | ONE logo + ONE cut ✓ |
| ESC @ + 4× GS commands scattered throughout | 4 | FOUR logos (original bug) |

### The Solution: Exactly Two `0x1D` Bytes

The receipt ESC/POS stream must contain **exactly two** `0x1D` bytes:

1. **`CMD_LOGO_TRIGGER`** = `[0x1D, 0x21, 0x00]` — placed immediately after `ESC @` init. This `GS !` command sets normal character size AND triggers futurePRNT to insert the NV logo.

2. **`CMD_CUT`** = `[0x1D, 0x56, 0x01]` — placed at the very end of the stream. This `GS V` partial cut command cuts the paper. Being at the end, it does NOT trigger a logo.

**All other commands** use `0x1B` (ESC) prefix ONLY:

| Purpose | Command | Bytes |
|---|---|---|
| Initialize | ESC @ | `[0x1B, 0x40]` |
| **Logo trigger** | **GS ! 0x00** | **`[0x1D, 0x21, 0x00]`** |
| Align left | ESC a 0 | `[0x1B, 0x61, 0x00]` |
| Align center | ESC a 1 | `[0x1B, 0x61, 0x01]` |
| Align right | ESC a 2 | `[0x1B, 0x61, 0x02]` |
| Bold on | ESC E 1 | `[0x1B, 0x45, 0x01]` |
| Bold off | ESC E 0 | `[0x1B, 0x45, 0x00]` |
| Double size | ESC ! 0x30 | `[0x1B, 0x21, 0x30]` |
| Normal size | ESC ! 0x00 | `[0x1B, 0x21, 0x00]` |
| **Partial cut** | **GS V 1** | **`[0x1D, 0x56, 0x01]`** |

### Cash Drawer

The cash drawer must be opened with **ESC p without ESC @ init** — `[0x1B, 0x70, 0x00, 0x19, 0xFA]`. Do NOT send `ESC @` before it — that would trigger futurePRNT to insert a logo and print/cut a receipt with just a logo on it.

**Why not BEL (0x07)?** BEL is the traditional Star drawer kick, but futurePRNT's ESC/POS Routing swallows it — the byte never reaches the printer hardware. ESC p (`0x1B 0x70`) is the standard ESC/POS drawer kick command and is passed through to the printer correctly.

The print server's `/cash-drawer` endpoint sends: `Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA])`

The app's `escPosOpenDrawer()` returns: `new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA])`

### Important: ESC ! Resets Bold

`ESC !` (select print mode) controls font, bold, underline, double width, and double height all in one byte. This means:
- `CMD_DOUBLE_SIZE` (`ESC ! 0x30`) resets bold to OFF
- `CMD_BOLD_ON` must come AFTER `CMD_DOUBLE_SIZE`, not before
- `CMD_NORMAL_SIZE` (`ESC ! 0x00`) also resets bold to OFF

## Files Involved

| File | Location | Purpose |
|---|---|---|
| `server.js` | `C:\print-server\server.js` on Optiplex | Print relay server |
| `receipt-template.ts` | `src/app/pos/lib/receipt-template.ts` on Hostinger | ESC/POS generation |
| `web_logo.bmp` | `C:\print-server\web_logo.bmp` on Optiplex | Logo file (used by futurePRNT, not by code) |
| futurePRNT | Star Configuration Utility on Optiplex | Logo storage + injection |

## futurePRNT Configuration Checklist

When setting up or reconfiguring the printer:

1. Open Configuration Utility TSP100
2. Select **ESC/POS** emulation mode
3. **Print Job Routing** → check **ESC/POS Routing** → Apply Changes
4. **Image List** → Add New → select BMP/JPG/GIF logo → adjust width (45mm recommended) → Use Image → Apply Changes
5. **Logos & Cropping** → Top Image List → Add → select logo → Center alignment → Use → Apply Changes
6. **General Settings** → Print Width = **72mm** → Apply Changes
7. Test: `curl -X POST http://{optiplex_ip}:8080/test`

## Printer Share Setup

The Star printer MUST be shared on Windows for raw binary writes to work:

1. Settings → Devices → Printers & scanners → Star TSP100 Cutter (TSP143)
2. Printer properties → Sharing tab → check "Share this printer"
3. Share name: **StarTSP100**
4. The print server writes to `\\localhost\StarTSP100`

## Network Configuration

- Optiplex IP: **192.168.1.81** (DHCP — set a static IP or DHCP reservation to prevent changes)
- Print server port: **8080**
- Print server URL in app admin: `http://192.168.1.81:8080`

## Lessons Learned

1. **Research manufacturer tooling first.** Star's futurePRNT was designed to solve the logo problem. We should have investigated it before writing custom raster code.

2. **futurePRNT's ESC/POS parser triggers on raw `0x1D` bytes**, not on specific command sequences. Any `0x1D` byte after `ESC @` is treated as a receipt boundary except at the very end of the stream.

3. **Star Line Mode commands don't work in ESC/POS emulation mode.** The printer accepts ESC/POS commands when configured for ESC/POS emulation. Star-specific commands like `ESC GS a`, `ESC i`, and `ESC * r` are for Star Line Mode only.

4. **`ESC !` is a combined attribute command.** It resets bold, underline, font, and size all at once. Bold must be set AFTER size, not before.

5. **USB printers on Windows require a printer share** for raw binary writes. Direct port writes to `\\.\\USB003` do not work.

6. **ESC p without ESC @ init opens the cash drawer.** BEL (`0x07`) does NOT work — futurePRNT ESC/POS Routing swallows it. ESC p (`0x1B 0x70 0x00 0x19 0xFA`) is passed through correctly. Never send `ESC @` before the drawer command — it triggers futurePRNT logo injection.

7. **Test at the binary level.** Writing small Node.js scripts that send exact byte sequences directly to the printer share was the fastest way to isolate the problem. Each test changed exactly one variable.

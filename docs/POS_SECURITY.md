# POS Security — IP Whitelist

This document describes the IP whitelist feature for restricting POS access to authorized locations.

## Overview

The POS system can be restricted to only allow access from specific IP addresses. This is useful for:
- Limiting POS access to the shop's network
- Allowing access from specific remote locations (e.g., another building)
- Preventing unauthorized access from unknown locations

## Configuration

### Admin Settings Page

Navigate to **Settings > POS Security** (`/admin/settings/pos-security/`)

The page provides:
1. **Enable/Disable Toggle** — Master switch for IP restrictions (auto-saves immediately)
2. **Your Current IP** — Shows your public IP with "Add My IP" button
3. **IP Whitelist** — Two-column layout: IP Address | Location Name

### IP Entry Format

Each whitelist entry has:
- **IP Address** — IPv4 (e.g., `172.249.105.229`) or IPv6 (e.g., `2001:0db8::1`)
- **Location Name** — Optional friendly name (e.g., "Office", "Home", "Shop")

### Toggle States

| State | Behavior |
|-------|----------|
| **Enabled** | Only whitelisted IPs can access `/pos/*`. All others see "Access denied" |
| **Disabled** | POS accessible from any IP address (no restrictions) |

**Note:** The toggle auto-saves when switched. IP addresses require clicking "Save Changes".

## Technical Implementation

### Database Settings

Two keys in `business_settings` table:
- `pos_ip_whitelist_enabled` — Boolean (true/false)
- `pos_allowed_ips` — JSON array of objects: `[{"ip": "172.249.105.229", "name": "Office"}, {"ip": "98.45.32.10", "name": "Home"}]`

The middleware extracts just the IP addresses for validation. Location names are for display only.

### Middleware

File: `src/middleware.ts`

The middleware:
1. Checks if request path starts with `/pos`
2. Fetches whitelist config from `/api/internal/allowed-ips`
3. If enabled and IPs configured, validates client IP
4. Returns 403 if IP not in whitelist

### Caching

- Settings cached in-memory for **10 seconds**
- Changes take effect within 10 seconds
- Cache reduces database load on every request

### API Routes

| Route | Purpose |
|-------|---------|
| `/api/internal/allowed-ips` | Returns `{ ips: string[], enabled: boolean }` for middleware |
| `/api/admin/current-ip` | Returns requester's public IP for "Add My IP" feature |

## Testing with ngrok

To test IP restrictions from external locations without deploying:

1. **Install ngrok** (already installed at `~/bin/ngrok`)

2. **Start your dev server:**
   ```bash
   npm run dev
   ```

3. **Create tunnel:**
   ```bash
   ~/bin/ngrok http 3000
   ```

4. **Get public URL** (e.g., `https://abc123.ngrok-free.app`)

5. **Configure whitelist:**
   - Add your location's IP
   - Add the test location's IP (e.g., `172.249.105.229`)
   - Enable the toggle
   - Save

6. **Test from external location:**
   - Access `https://abc123.ngrok-free.app/pos`
   - Should work if IP is whitelisted
   - Should show "Access denied" if not

## Finding a Location's Public IP

Visit any of these sites from the location you want to whitelist:
- https://whatismyip.com
- https://api.ipify.org (IPv4 only)
- https://ifconfig.me

The IP shown is what you need to add to the whitelist.

### IPv4 vs IPv6

- **IPv4**: Traditional format like `172.249.105.229`
- **IPv6**: Newer format like `2a04:4e41:29b1:6a71::12b1:6a71`

Mobile devices often connect via IPv6. If testing with ngrok shows a different IP than expected, check both IPv4 and IPv6 addresses. The whitelist supports both formats.

## Fallback Behavior

If the database is unavailable, the middleware falls back to the `ALLOWED_POS_IPS` environment variable:

```env
ALLOWED_POS_IPS=172.249.105.229,98.45.32.10
```

This ensures the system works even if there's a database connection issue.

## Security Considerations

- **IP spoofing:** IP-based restrictions are not foolproof. IPs can be spoofed in some scenarios.
- **Shared IPs:** Multiple businesses may share the same public IP (e.g., office buildings)
- **Dynamic IPs:** Home/mobile networks often have dynamic IPs that change periodically
- **VPNs:** Users on VPNs will appear from the VPN's IP, not their actual location

For maximum security, combine IP restrictions with:
- Strong employee PINs
- Regular PIN rotation
- Activity monitoring

## Files

| File | Purpose |
|------|---------|
| `src/app/admin/settings/pos-security/page.tsx` | Admin settings UI |
| `src/app/api/internal/allowed-ips/route.ts` | API for middleware to fetch config |
| `src/app/api/admin/current-ip/route.ts` | API to detect user's public IP |
| `src/middleware.ts` | Request interception and IP validation |

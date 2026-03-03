# Smart Details Print Server

Local Node.js HTTP server that receives ESC/POS binary data from the web app and relays it to the Star TSP100III receipt printer connected via USB.

## Prerequisites

- **Node.js** 18+ installed on the Windows PC
- **Star TSP100 Cutter (TSP143)** printer driver installed
- Printer visible in Windows under Devices & Printers

## Setup

1. Copy this folder to `C:\print-server\` on the Optiplex (192.168.1.174)

2. Install dependencies:
   ```cmd
   cd C:\print-server
   npm install
   ```

3. Start the server:
   ```cmd
   node server.js
   ```

4. Test from any machine on the network:
   ```bash
   curl http://192.168.1.174:8080/health
   curl -X POST http://192.168.1.174:8080/test
   ```

5. Configure in the app:
   - Go to **Admin > Settings > Receipt Printer**
   - Set **Print Server URL** to `http://192.168.1.174:8080`
   - Click **Test Connection** to verify
   - Click **Test Print** to print a test receipt

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server status check |
| POST | `/print` | Print raw ESC/POS binary data |
| POST | `/test` | Print a test receipt |
| POST | `/cash-drawer` | Kick cash drawer open |

## Run on Startup (Optional)

To auto-start the print server when Windows boots:

1. Create a shortcut to `node.exe C:\print-server\server.js`
2. Place it in `shell:startup` (press Win+R, type `shell:startup`)

Or use Task Scheduler to run `node C:\print-server\server.js` at logon.

## Printer Configuration

Default settings in `server.js`:

```js
const PRINTER_NAME = 'Star TSP100 Cutter (TSP143)';
const PRINTER_PORT = 'USB003';
```

To verify your printer name and port:
```cmd
wmic printer get name,portname
```

Update the constants in `server.js` if they differ.

## Troubleshooting

### "Print server unreachable"
- Is `node server.js` running on the Optiplex?
- Can you ping 192.168.1.174 from the device running the app?
- Check Windows Firewall: allow inbound TCP on port 8080
  ```cmd
  netsh advfirewall firewall add rule name="Print Server" dir=in action=allow protocol=tcp localport=8080
  ```

### "Failed to write to printer"
- Is the printer powered on and showing Ready?
- Check USB cable connection
- Verify printer name: `wmic printer get name,portname`
- Try printing from Windows to confirm the driver works

### CORS errors in browser console
- The server allows all origins by default. If you see CORS errors, the server may not be running.

### Port already in use
- Another process is using port 8080. Change it:
  ```cmd
  set PORT=9090 && node server.js
  ```

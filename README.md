# captcha-relay

Human-in-the-loop CAPTCHA solving via token relay. When browser automation hits a CAPTCHA, captcha-relay extracts the sitekey, serves a relay page with the real CAPTCHA widget, and sends a link to your phone. You solve it natively, and the token flows back into the automated browser via CDP.

No third-party solving services. No API keys. Just you and your phone.

## How It Works

```
Browser hits CAPTCHA
        ↓
  Detect type + sitekey via CDP
        ↓
  Start relay server (serves real CAPTCHA widget)
        ↓
  Generate URL → send to phone (Telegram, etc.)
        ↓
  Human solves CAPTCHA on phone
        ↓
  Token POSTed back to relay server
        ↓
  Token injected into browser via CDP
        ↓
  Automation continues ✓
```

## Supported CAPTCHAs

| Type | Method | Status |
|------|--------|--------|
| **reCAPTCHA v2** | Token relay | ✅ Tested |
| **hCaptcha** | Token relay | ✅ Supported |
| **Cloudflare Turnstile** | Token relay | ✅ Supported |
| **Other / unknown** | Screenshot fallback | ⚠️ Manual click coordinates |

For unsupported CAPTCHA types, the screenshot fallback captures and annotates the page, letting you indicate click positions visually.

## Setup

### Prerequisites

- **Node.js 18+**
- **Chrome/Chromium** launched with CDP enabled:
  ```bash
  chromium --remote-debugging-port=18800
  ```

### Installation

```bash
git clone https://github.com/0xclanky/captcha-relay.git
cd captcha-relay
npm install
```

### Network Setup

Your phone needs to reach the relay server. Pick one:

#### Tailscale (Recommended)

Tailscale creates a private mesh VPN between your devices — no public URLs, no splash pages, WireGuard-encrypted.

**1. Server/host machine** (where browser automation runs):

```bash
# Install
curl -fsSL https://tailscale.com/install.sh | sh

# Start and authenticate
sudo tailscale up
# Follow the link to authenticate

# Note your Tailscale IP
tailscale ip -4
```

**2. Phone** (where you solve CAPTCHAs):

- Install **Tailscale** from [App Store](https://apps.apple.com/app/tailscale/id1470499037) (iOS) or [Play Store](https://play.google.com/store/apps/details?id=com.tailscale.ipn) (Android)
- Open the app and sign in with the **same account**
- Done — your phone can now reach the server via its Tailscale IP

**3. Additional devices:** Same process — install Tailscale, sign in, they're on the Tailnet.

**4. Verify connectivity:**

Open your phone browser and visit:
```
http://<tailscale-ip>:8765
```

If you see the relay page, you're set. Use the `--no-tunnel` flag since Tailscale handles networking:

```bash
node index.js --no-tunnel
```

#### Alternative Network Options

| Method | How | Trade-offs |
|--------|-----|------------|
| **Same WiFi/LAN** | `--no-tunnel`, access via local IP | LAN only |
| **localtunnel** | Built-in (default) | Works anywhere, but has splash page on first visit |
| **cloudflared** | Supported | Fast and reliable, but resource-heavy |

### Security Notes

- **Tailscale** uses WireGuard encryption, peer-to-peer — no data goes through public servers. Only devices on your Tailnet can access the relay.
- Secure your Tailscale account with **2FA**.
- **localtunnel** and **cloudflared** expose public URLs — anyone with the link can access your relay page. Less secure, use for quick testing only.

## Usage

### CLI

```bash
# Basic — auto-detect CAPTCHA, tunnel via localtunnel
node index.js

# With Tailscale (no tunnel needed)
node index.js --no-tunnel

# Custom CDP port and timeout
node index.js --cdp-port 9222 --timeout 180

# Screenshot fallback mode
node index.js --screenshot

# Don't inject token (just return it)
node index.js --no-inject
```

Outputs JSON events to stdout:
```json
{"event": "ready", "relayUrl": "https://...", "type": "recaptcha-v2", "sitekey": "..."}
{"event": "solved", "token": "03AGdBq...", "injected": true}
```

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--cdp-port N` | Chrome DevTools Protocol port | `18800` |
| `--timeout N` | Timeout in seconds | `120` |
| `--no-tunnel` | Skip tunnel, use local IP only | off |
| `--no-inject` | Return token without injecting into browser | off |
| `--screenshot` | Use screenshot fallback instead of token relay | off |

### Module API

```js
const { solveCaptcha } = require('captcha-relay');

const result = await solveCaptcha({
  cdpPort: 18800,
  timeout: 120000,
  inject: true,
  useTunnel: false,       // false when using Tailscale
});

console.log(result.relayUrl);  // URL to send to human
// ... human solves CAPTCHA ...
console.log(result.token);     // solved token
console.log(result.solved);    // true
```

You can skip auto-detection by passing `type`, `sitekey`, and `pageUrl` directly:

```js
const result = await solveCaptcha({
  type: 'recaptcha-v2',
  sitekey: '6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-',
  pageUrl: 'https://example.com/login',
});
```

## Architecture

The system has four main components:

- **Detector** (`lib/detect.js`) — Connects to the browser via CDP, scans the page for CAPTCHA iframes/scripts, extracts type and sitekey
- **Relay Server** (`lib/server.js`) — HTTP + WebSocket server that serves the CAPTCHA widget page and waits for the solved token
- **Injector** (`lib/inject.js`) — Takes the solved token and injects it back into the browser page via CDP
- **Tunnel** (`lib/tunnel.js`) — Optional tunnel (localtunnel/cloudflared) for remote access

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full breakdown.

## License

MIT

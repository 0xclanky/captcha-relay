---
name: captcha-relay
description: "Human-in-the-loop CAPTCHA solving via token relay. When the browser hits a CAPTCHA (reCAPTCHA v2, hCaptcha, Cloudflare Turnstile), extracts the sitekey, serves a relay page with the real CAPTCHA widget, sends the human a solve link (via Telegram or any messaging), captures the token, and injects it back into the browser page via CDP. Triggers on CAPTCHA detection, blocked form submissions, or explicit 'solve captcha' requests. Also supports screenshot-grid fallback for non-token CAPTCHAs."
---

# CAPTCHA Relay v2

Solve CAPTCHAs by relaying them to a human via a token relay page.

## Flow

1. Detect CAPTCHA type + sitekey from browser page via CDP
2. Start local HTTP server serving the real CAPTCHA widget
3. Get accessible URL (Tailscale IP, tunnel, or LAN)
4. Send URL to human (via Telegram message tool or inline button)
5. Human opens URL on phone/PC, solves CAPTCHA natively
6. Token POSTed back → injected into automated browser via CDP

## Usage

### As CLI

```bash
cd skills/captcha-relay && npm install
node index.js                          # auto-detect, tunnel, inject
node index.js --no-tunnel              # Tailscale/LAN — no tunnel needed
node index.js --no-inject --timeout 180
node index.js --screenshot             # fallback: screenshot grid overlay
```

Outputs JSON to stdout:
- `{"event":"ready","relayUrl":"http://..."}` — send this URL to human
- `{"event":"solved","token":"..."}` — done, token injected

### As Module

```js
const { solveCaptcha } = require('./index');
const result = await solveCaptcha({ cdpPort: 18800, inject: true, useTunnel: false });
// result.relayUrl — URL to send to human
// result.token — solved CAPTCHA token
```

Override auto-detection: pass `type`, `sitekey`, `pageUrl` directly.

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--no-inject` | inject | Return token without injecting into browser |
| `--screenshot` | token relay | Use screenshot grid fallback |
| `--no-tunnel` | tunnel | Skip tunnel, use local/Tailscale IP |
| `--timeout N` | 120 | Timeout in seconds |
| `--cdp-port N` | 18800 | Chrome DevTools Protocol port |

## Network Access

The relay server must be reachable from the human's device.

| Method | Best For |
|--------|----------|
| **Tailscale** (recommended) | Always-on, works anywhere, no splash pages. See `TAILSCALE.md` |
| **localtunnel** (default tunnel) | Quick, free, works anywhere. Has splash page on first visit |
| **LAN IP** (`--no-tunnel`) | Same WiFi only |

With Tailscale: use `--no-tunnel`. The `getTailscaleIp()` helper auto-detects the 100.x.x.x IP.

## Agent Workflow

When browser automation hits a CAPTCHA:

1. Call `solveCaptcha({ useTunnel: false })` (if Tailscale) or `solveCaptcha()` (with tunnel)
2. Send `result.relayUrl` to human via `message` tool (Telegram inline button recommended)
3. Wait — `solveCaptcha` resolves when human completes the CAPTCHA
4. Token is auto-injected; continue automation

## Supported CAPTCHAs

- **reCAPTCHA v2** — token relay ✅ (tested)
- **hCaptcha** — token relay (best candidate, no client-side domain check)
- **Cloudflare Turnstile** — token relay
- **Other** (sliders, text, etc.) — screenshot grid fallback via `--screenshot`

## Requirements

- Chrome/Chromium with `--remote-debugging-port=18800`
- Node.js 18+ and `npm install` (deps: ws, sharp)
- Tailscale (recommended) or internet for tunnel

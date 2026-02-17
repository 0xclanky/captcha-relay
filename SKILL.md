---
name: captcha-relay
description: "Human-in-the-loop CAPTCHA solving via token relay. When the browser hits a CAPTCHA (reCAPTCHA v2, hCaptcha, Turnstile), extracts the sitekey, serves a relay page with the real widget, sends the human a link, captures the solved token, and injects it back into the browser via CDP."
---

# CAPTCHA Relay v2

Solve CAPTCHAs by relaying them to a human via a token relay page.

## How It Works

1. Detects CAPTCHA type + sitekey from the browser page via CDP
2. Starts a local HTTP server serving the real CAPTCHA widget
3. Creates a tunnel (localtunnel or cloudflared) for phone access
4. Human opens URL on phone, solves the CAPTCHA natively
5. Token POSTed back to relay server
6. Token injected into the automated browser via CDP

## Quick Start

```bash
cd /home/clanky/.openclaw/workspace/skills/captcha-relay
npm install   # ws, sharp
node index.js
```

Outputs JSON events to stdout:
- `{"event": "ready", "relayUrl": "https://...", ...}` — send this URL to human
- `{"event": "solved", "token": "...", ...}` — CAPTCHA solved and injected

## Options

| Flag | Description |
|------|-------------|
| `--no-inject` | Return token without injecting into browser |
| `--screenshot` | Use screenshot fallback instead of token relay |
| `--no-tunnel` | Skip tunnel, use local IP only |
| `--timeout N` | Timeout in seconds (default: 120) |
| `--cdp-port N` | Chrome DevTools Protocol port (default: 18800) |

## Module API

```js
const { solveCaptcha } = require('./index');

const result = await solveCaptcha({
  cdpPort: 18800,
  timeout: 120000,
  inject: true,
  useTunnel: true,
});
// result.relayUrl — URL to send to human
// result.token — solved token
// result.solved — true
```

You can also pass `type`, `sitekey`, and `pageUrl` to skip auto-detection.

## Tunneling Options

| Method | Pros | Cons |
|--------|------|------|
| **localtunnel** (default) | Free, no install, works anywhere | Splash page on first visit |
| **cloudflared** | Fast, reliable URLs | Heavy binary, too much for constrained machines |
| **Tailscale** (recommended for production) | No tunnel needed, always-on, no splash | Requires setup on both devices |
| **Local IP** (fallback) | No dependencies | LAN only |

See `TAILSCALE.md` for Tailscale setup instructions.

## Token File

When a token is received, it's written to `/tmp/captcha-relay-token.txt` for external consumers.

## Tested

- ✅ reCAPTCHA v2 token relay — works with Google's demo site
- ✅ localtunnel tunneling
- ⚠️ hCaptcha / Turnstile — should work but not yet tested end-to-end

## Requirements

- Chrome/Chromium with `--remote-debugging-port=18800`
- Node.js + `npm install` (ws, sharp)
- For tunneling: `npx localtunnel` (default) or `cloudflared` binary

## Agent Workflow

1. Detect CAPTCHA during browser automation
2. Run `solveCaptcha()` or `node index.js`
3. Send the relay URL to human via Telegram
4. Wait for solved event
5. Continue automation

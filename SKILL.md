---
name: captcha-relay
description: Human-in-the-loop CAPTCHA solving via Telegram. Use when the browser hits a CAPTCHA (reCAPTCHA, hCaptcha, Turnstile) during automation. Screenshots the challenge, overlays a numbered grid, sends to a human via Telegram inline buttons, waits for their response, and injects the answer back into the page. Triggers on CAPTCHA detection, blocked form submissions, or explicit "solve captcha" requests.
---

# CAPTCHA Relay

Solve CAPTCHAs by relaying them to a human via Telegram.

## Quick Start

When a CAPTCHA is detected on a page:

```bash
cd {{SKILL_DIR}}/../captcha-relay
node solve.js --inject
```

This single command:
1. Connects to Chrome via CDP (port 18800)
2. Screenshots the page silently
3. Detects the CAPTCHA grid (type, dimensions, prompt)
4. Crops and annotates with numbered cell overlay
5. Sends to Telegram with inline tap-to-select buttons
6. Waits for human response (tap cells + Submit)
7. Injects clicks into the CAPTCHA and hits Verify

## Options

| Flag | Description |
|------|-------------|
| `--inject` | Also click cells + verify after getting answer |
| `--no-buttons` | Use text reply instead of inline buttons |
| `--timeout N` | Timeout in seconds (default: 120) |
| `--input FILE` | Use pre-made input JSON instead of CDP auto-detect |

## Manual Mode

If CDP auto-detect fails, write input JSON and use `--input`:

```json
{
  "screenshotPath": "/path/to/screenshot.png",
  "gridClip": { "x": 90, "y": 209, "w": 390, "h": 390 },
  "prompt": "Select all images with cars",
  "rows": 3,
  "cols": 3
}
```

```bash
node solve.js --input /tmp/captcha-input.json
```

## Output

stdout returns JSON:
```json
{"cells": [1, 4, 5, 6], "skipped": false}
```

Parse this to inject manually if not using `--inject`.

## Manual Injection (without --inject)

After getting cells from solve.js, inject via browser eval:

```javascript
// cells = [1, 4, 5, 6] (1-indexed)
const bf = document.querySelector('iframe[src*="recaptcha/api2/bframe"]');
const doc = bf.contentDocument;
const tds = doc.querySelectorAll('td[role="button"]');
cells.forEach(c => tds[c - 1].click());
doc.querySelector('#recaptcha-verify-button').click();
```

## Supported CAPTCHAs

- ✅ reCAPTCHA v2 (image grid — 3x3 and 4x4)
- 🔜 hCaptcha
- 🔜 Cloudflare Turnstile

## Requirements

- Chrome running with `--remote-debugging-port=18800`
- Telegram bot configured in OpenClaw
- `npm install` in the captcha-relay directory (sharp, ws)

## Troubleshooting

- **"No CAPTCHA grid detected"**: The challenge may have expired or the iframe structure changed. Retrigger the CAPTCHA checkbox and try again.
- **Timeout**: Human didn't respond in time. Increase with `--timeout 180`.
- **"Please try again"**: Google rejected the answer. Run solve.js again — it will detect the new challenge.
- **CDP connection failed**: Verify Chrome is running with `curl http://127.0.0.1:18800/json/version`.

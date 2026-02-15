# 🔓 captcha-relay

**Human-in-the-loop CAPTCHA solving via Telegram for AI agents and browser automation.**

When your AI agent hits a CAPTCHA it can't solve, captcha-relay screenshots it, overlays a numbered grid, sends it to you on Telegram, waits for your reply, and injects the answer back into the browser. You solve it from your phone in seconds.

## Why?

AI agents that automate browsers (like [OpenClaw](https://github.com/openclaw/openclaw)) get blocked by CAPTCHAs constantly. Commercial CAPTCHA-solving services exist, but they're:
- Expensive at scale
- Unreliable on complex/custom CAPTCHAs
- Not something you want processing your private sessions

**captcha-relay** keeps the human in the loop — specifically, *your* human — via a messaging app they already have open.

## How It Works

```
Agent hits CAPTCHA → Screenshot → Grid overlay → Telegram message → Human replies → Answer injected → Done
```

1. **Detection**: Agent detects a CAPTCHA on the page (configurable selectors + heuristics)
2. **Screenshot**: Captures the CAPTCHA element
3. **Grid Overlay**: For image-grid CAPTCHAs (reCAPTCHA, hCaptcha), overlays numbered labels on each cell
4. **Relay**: Sends the annotated image to you via Telegram with instructions
5. **Response**: You reply with cell numbers (e.g., `1 3 5 8`) or text answer
6. **Injection**: Clicks/types the answer back into the page
7. **Confirmation**: Submits and verifies success

## Supported CAPTCHA Types

| Type | Input Method | Status |
|------|-------------|--------|
| Image grid (reCAPTCHA v2, hCaptcha) | Reply with cell numbers: `1 3 5` | 🚧 Planned |
| Text CAPTCHA | Reply with text: `xK9mP2` | 🚧 Planned |
| Slider/puzzle | Coordinate-based or live relay | 🔮 Future |
| Cloudflare Turnstile | Auto-detect + notify | 🔮 Future |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  AI Agent   │────▶│ captcha-relay│────▶│  Telegram    │
│  (browser)  │◀────│  (bridge)    │◀────│  (human)    │
└─────────────┘     └──────────────┘     └─────────────┘
```

### Components

- **Detector**: Identifies CAPTCHAs on a page via selectors, iframes, and heuristics
- **Annotator**: Screenshots and overlays numbered grid on image CAPTCHAs
- **Relay**: Sends annotated image to Telegram, awaits reply with timeout
- **Injector**: Parses human response and interacts with the CAPTCHA form

## Integration with OpenClaw

captcha-relay is designed as an **OpenClaw skill** that hooks into the browser automation pipeline. When the agent encounters a CAPTCHA:

1. The skill activates automatically (or is called explicitly)
2. Uses OpenClaw's existing Telegram channel to communicate
3. Returns control to the agent once solved

```javascript
// Example: OpenClaw skill usage
// Agent detects CAPTCHA, calls captcha-relay
const solution = await captchaRelay.solve({
  page,           // Playwright/CDP page reference
  chatId,         // Telegram chat ID for the human
  timeout: 120000 // 2 minute timeout
});
```

## Installation

```bash
# As an OpenClaw skill (recommended)
clawhub install captcha-relay

# Standalone
npm install captcha-relay
```

## Configuration

```json
{
  "telegram": {
    "botToken": "YOUR_BOT_TOKEN",
    "chatId": "YOUR_CHAT_ID"
  },
  "timeout": 120000,
  "gridStyle": {
    "fontSize": 18,
    "color": "#FF0000",
    "background": "rgba(0,0,0,0.7)"
  }
}
```

## Development

```bash
git clone https://github.com/0xclanky/captcha-relay.git
cd captcha-relay
npm install
npm test
```

## Roadmap

- [ ] Core CAPTCHA detection (reCAPTCHA v2, hCaptcha, Turnstile)
- [ ] Screenshot + grid overlay annotation
- [ ] Telegram relay (send image, receive answer)
- [ ] Answer injection back into browser
- [ ] OpenClaw skill packaging
- [ ] Text CAPTCHA support
- [ ] Multi-step CAPTCHA support (click all images, then verify)
- [ ] Telegram inline buttons for faster solving
- [ ] Timeout + retry logic
- [ ] Audio CAPTCHA fallback option

## License

MIT — see [LICENSE](LICENSE)

## Credits

Built by [0xclanky](https://github.com/0xclanky) 🔧 — an AI that needed a human to solve its CAPTCHAs.

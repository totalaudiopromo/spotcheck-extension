# Spot Checker - Spotify Playlist Validator

Chrome/Firefox/Safari extension that validates Spotify playlists for music promoters. Detects bot playlists, tracks follower changes, and exports validation reports.

## Features

### Free Tier

- 5 playlist checks per day
- Basic metrics (followers, tracks, public status)
- Curator info and links
- Active/removed detection

### Premium (£4.99/month)

- Unlimited checks
- Bulk validation (50 playlists at once)
- Historical tracking (follower trends)
- CSV/JSON export
- Bot detection score

### Pro (£14.99/month)

- Everything in Premium
- API access (100 requests/day)
- Webhook alerts for playlist changes
- Priority support

## Project Structure

```
apps/spot-checker/
├── extension/              # Browser extension source
│   ├── manifest.json       # Chrome/Chromium manifest (v3)
│   ├── manifest.firefox.json
│   ├── manifest.safari.json
│   ├── popup/              # Extension popup UI
│   ├── background/         # Service worker
│   ├── content/            # Content scripts
│   ├── lib/                # Shared utilities
│   └── icons/              # Extension icons
├── backend/                # API endpoints
│   └── api/
│       ├── spotify-token/  # Spotify auth
│       ├── subscription/   # Stripe subscription
│       ├── sync/           # Cloud sync
│       └── webhooks/       # Stripe webhooks
└── scripts/
    └── build.sh            # Multi-browser build
```

## Browser Compatibility

| Browser | Version | Status       |
| ------- | ------- | ------------ |
| Chrome  | 88+     | ✅ Supported |
| Firefox | 109+    | ✅ Supported |
| Safari  | 16.4+   | ✅ Supported |
| Arc     | Latest  | ✅ Supported |
| Opera   | 74+     | ✅ Supported |
| Edge    | 88+     | ✅ Supported |
| Brave   | Latest  | ✅ Supported |
| Vivaldi | Latest  | ✅ Supported |

## Development

### Prerequisites

- Node.js 18+
- pnpm
- Spotify Developer account (for API credentials)
- Stripe account (for payments)

### Setup

1. Clone and install:

```bash
cd apps/spot-checker
pnpm install
```

2. Set environment variables:

```bash
# .env.local
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_PRODUCT_ID=prod_...
STRIPE_PRO_PRODUCT_ID=prod_...
```

3. Load extension in browser:
   - Chrome: `chrome://extensions` → Load unpacked → Select `extension/`
   - Firefox: `about:debugging` → Load Temporary Add-on → Select `manifest.firefox.json`

### Building

```bash
./scripts/build.sh
```

Creates packages for all browsers:

- `dist/spot-checker-chrome.zip` (Chrome, Arc, Opera, Edge, Brave)
- `dist/spot-checker-firefox.zip` (Firefox)
- `dist/safari/` (Safari - needs Xcode conversion)

### Safari Conversion

```bash
xcrun safari-web-extension-converter dist/safari --project-location dist/safari-project
```

## API Endpoints

### POST /api/spotify-token

Returns a fresh Spotify access token.

### POST /api/subscription/verify

Verifies user subscription status.

Request:

```json
{
  "email": "user@example.com",
  "subscriptionId": "sub_..."
}
```

Response:

```json
{
  "active": true,
  "tier": "premium",
  "expiresAt": 1735689600000
}
```

### POST /api/webhooks/stripe

Stripe webhook handler for subscription events.

## Deployment

1. **Extension Stores:**
   - Chrome Web Store: Upload `spot-checker-chrome.zip`
   - Firefox Add-ons: Upload `spot-checker-firefox.zip`
   - Apple App Store: Build from Safari project

2. **Backend:**
   - Deploy to Vercel via Total Audio Platform monorepo
   - Configure environment variables in Vercel dashboard

## License

Proprietary - Total Audio Promo Ltd

# Baywave Lane Availability Display

A real-time lane availability board for Baywave pool, designed for display screens. Fetches session data from taurangapools.co.nz and renders a colour-coded swimlane grid.

## Setup

```bash
npm install
npm start
```

The server runs on port 3000 by default. To change it:

```bash
PORT=8080 npm start
```

## Deployment

The app is a Node/Express server intended to run behind a reverse proxy (nginx, Apache, etc.) on your domain. Use PM2 or a systemd service to keep it alive across reboots and crashes.

Once deployed, update the `Access-Control-Allow-Origin` header in `api/swimlane.js` from `*` to your actual domain.

## How it works

The backend (`api/swimlane.js`) proxies requests to the taurangapools.co.nz lane availability page — it fetches a fresh session cookie, then hits the swimlane endpoint and returns the HTML payload as JSON. The frontend parses that HTML and renders the grid.

The display auto-refreshes every 15 minutes and hard-reloads every hour to pick up any deployed changes.

## Dependencies

- Node 18+ (uses native `fetch`)
- `express`

// Local dev server that mirrors the Vercel deployment: serves the static
// display page and wires up the same /api/* handlers used in production
// (Vercel calls the files under api/ directly as serverless functions;
// here they're mounted as plain Express routes instead).
const express = require('express');
const path = require('path');
const handler = require('./api/swimlane');
const poolTempHandler = require('./api/pool-temp');
const closuresHandler = require('./api/closures');
const heartbeatHandler = require('./api/heartbeat');
const checkHeartbeatHandler = require('./api/check-heartbeat');

const app = express();
const PORT = process.env.PORT || 3000;

// The display is a kiosk page left open for hours/days, so it must always get
// fresh HTML (and therefore fresh app.js) rather than a stale cached copy.
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Proxy routes — each delegates to the matching serverless-style handler in api/
app.get('/api/swimlane', (req, res) => handler(req, res));
app.get('/api/pool-temp', (req, res) => poolTempHandler(req, res));
app.get('/api/closures', (req, res) => closuresHandler(req, res));
app.post('/api/heartbeat', (req, res) => heartbeatHandler(req, res));
app.get('/api/check-heartbeat', (req, res) => checkHeartbeatHandler(req, res));

app.listen(PORT, () => {
  console.log(`Baywave display running at http://localhost:${PORT}`);
}).on('error', err => {
  console.error('Server failed to start:', err.message);
  process.exit(1);
});

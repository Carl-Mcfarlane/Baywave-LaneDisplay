const express = require('express');
const path = require('path');
const handler = require('./api/swimlane');

const app = express();
const PORT = process.env.PORT || 3000;

// No-cache for HTML
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/swimlane', (req, res) => handler(req, res));

app.listen(PORT, () => {
  console.log(`Baywave display running at http://localhost:${PORT}`);
});

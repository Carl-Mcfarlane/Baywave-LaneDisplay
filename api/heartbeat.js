// Pinged by the display (public/app.js) on every poll cycle. Recording "last
// seen" here lets check-heartbeat.js notice when the TV's browser has gone
// quiet — crashed, lost network, or the machine itself is off — independent
// of whether the upstream lane-availability site is working.
const { redisSet, redisDel } = require('./_lib/upstash');

module.exports = async function handler(req, res) {
  try {
    await redisSet('heartbeat:last', Date.now());
    // Clear any stale-alert flag so a recovery doesn't get treated as still-down.
    await redisDel('heartbeat:alerted');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

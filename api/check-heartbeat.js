// Triggered by Vercel Cron (see vercel.json) every 10 minutes. Checks how long
// it's been since the display last pinged /api/heartbeat and, if it's gone
// quiet for longer than the display's own 15-minute poll cycle can explain,
// emails an alert — once per outage, not on every cron run.
const { redisGet, redisSet } = require('./_lib/upstash');

// Display polls every 15 min; allow one missed cycle plus buffer before alerting.
const STALE_MS = 35 * 60 * 1000;

module.exports = async function handler(req, res) {
  // Vercel attaches this header automatically for requests it makes to cron
  // paths, using the CRON_SECRET env var — rejects anyone else hitting this route.
  const auth = req.headers.authorization;
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const last = await redisGet('heartbeat:last');
    // No heartbeat recorded yet (fresh deploy) — nothing to compare against.
    if (!last) return res.status(200).json({ ok: true, skipped: 'no heartbeat yet' });

    const age = Date.now() - Number(last);
    if (age <= STALE_MS) return res.status(200).json({ ok: true, ageMs: age });

    const alreadyAlerted = await redisGet('heartbeat:alerted');
    if (alreadyAlerted) return res.status(200).json({ ok: true, ageMs: age, alreadyAlerted: true });

    await sendAlert(age);
    await redisSet('heartbeat:alerted', '1');
    return res.status(200).json({ ok: true, ageMs: age, alerted: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

async function sendAlert(ageMs) {
  const minutes = Math.round(ageMs / 60000);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM || 'onboarding@resend.dev',
      to: [process.env.ALERT_EMAIL_TO],
      subject: 'Baywave display has gone quiet',
      html: `<p>The lane display hasn't pinged in ${minutes} minutes. It may be offline, frozen, or disconnected from the network.</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
}

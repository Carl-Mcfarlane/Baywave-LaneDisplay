// Proxy for the taurangapools.co.nz swimlane API. A direct browser fetch is blocked
// by CORS, so this server-side handler performs the session+XSRF handshake first.
const BASE = 'https://www.taurangapools.co.nz';
// Upstream returns empty/malformed responses without a recognised browser UA.
const UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';

module.exports = async function handler(req, res) {
  const { source, date } = req.query;

  if (!source || !date) {
    return res.status(400).json({ error: 'Missing source or date param' });
  }

  try {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);

    // Step 1: fetch the main page to get a fresh session + XSRF cookie
    const pageRes = await fetch(`${BASE}/bookings/lane-availability`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      redirect: 'follow',
      signal: abort.signal,
    });

    // Grab all Set-Cookie headers
    const rawCookies = pageRes.headers.getSetCookie?.() ?? [];
    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');
    const xsrfMatch = cookieStr.match(/XSRF-TOKEN=([^;]+)/);
    const xsrfToken = xsrfMatch ? decodeURIComponent(xsrfMatch[1]) : '';

    // Step 2: hit the swimlane endpoint with the fresh session cookies
    const upstream = await fetch(
      `${BASE}/bookings/swimlane?source=${encodeURIComponent(source)}&date=${encodeURIComponent(date)}`,
      {
        headers: {
          'User-Agent': UA,
          'Accept': '*/*',
          'Referer': `${BASE}/bookings/lane-availability`,
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': xsrfToken,
          'Cookie': cookieStr,
        },
        signal: abort.signal,
      }
    );
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
    }

    const data = await upstream.json();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

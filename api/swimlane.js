const BASE = 'https://www.taurangapools.co.nz';
const UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';

export default async function handler(req, res) {
  const { source, date } = req.query;

  if (!source || !date) {
    return res.status(400).json({ error: 'Missing source or date param' });
  }

  try {
    // Step 1: fetch the main page to get a fresh session + XSRF cookie
    const pageRes = await fetch(`${BASE}/bookings/lane-availability`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      redirect: 'follow',
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
      }
    );

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

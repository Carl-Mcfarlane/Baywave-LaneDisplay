// Scrapes the current lap pool temperature from the public Baywave facility page,
// since there's no dedicated API endpoint for it.
const BASE = 'https://www.taurangapools.co.nz';
// Upstream returns empty/malformed responses without a recognised browser UA.
const UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';

module.exports = async function handler(req, res) {
  try {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);

    // Fetch the facility page HTML — the temperature is embedded in plain text, not an API field
    const pageRes = await fetch(`${BASE}/public-pools/baywave`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      redirect: 'follow',
      signal: abort.signal,
    });
    clearTimeout(timeout);

    if (!pageRes.ok) {
      return res.status(pageRes.status).json({ error: `Upstream returned ${pageRes.status}` });
    }

    const html = await pageRes.text();

    // The "Lap Pool" label appears before its temperature value in the HTML.
    // Allow up to 300 chars between the label and the number to skip over markup,
    // and accept the various ways "°" can be encoded (raw, entity, numeric entity).
    const match = html.match(/Lap(?:\s+Pool)?\b[\s\S]{0,300}?(\d+\.?\d*)\s*(?:&deg;|°|&#176;|&#x00B0;)C/i);
    if (!match) {
      return res.status(404).json({ error: 'Lap pool temperature not found' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json({ temp: `${match[1]}°C` });

  } catch (err) {
    clearTimeout(timeout);
    return res.status(500).json({ error: err.message });
  }
};

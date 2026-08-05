// Scrapes upcoming Baywave pool closure notices from the lane-availability page.
// There's no closures API, so this parses the announcement HTML with regexes
// rather than a proper HTML parser (Node has no built-in DOM).
const BASE = 'https://www.taurangapools.co.nz';
// Upstream returns empty/malformed responses without a recognised browser UA.
const UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';

// Maps month names (as they appear in closure text) to zero-indexed month numbers,
// used to build real Date objects for filtering/sorting.
const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

module.exports = async function handler(req, res) {
  try {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);

    // Closure notices live on the same lane-availability page as the booking widget
    const pageRes = await fetch(`${BASE}/bookings/lane-availability`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      redirect: 'follow',
      signal: abort.signal,
    });
    clearTimeout(timeout);

    if (!pageRes.ok) {
      return res.status(pageRes.status).json({ error: `Upstream returned ${pageRes.status}` });
    }

    const html = await pageRes.text();
    const closures = parseBaywaveClosures(html);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ closures });
  } catch (err) {
    clearTimeout(timeout);
    return res.status(500).json({ error: err.message });
  }
};

// Strips HTML tags and decodes the handful of HTML entities that show up in
// closure notices, collapsing whitespace so downstream regexes see plain text.
function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&[a-z#\d]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Matches dates written like "27th June", "3rd July", "6th September" etc.
const DATE_RE = /\d{1,2}(?:st|nd|rd|th)\s+(January|February|March|April|May|June|July|August|September|October|November|December)/gi;

// Pulls the day number and month name out of a single matched date string.
function parseDay(str) {
  const m = str.match(/(\d{1,2})(?:st|nd|rd|th)\s+(\w+)/i);
  return m ? { day: parseInt(m[1], 10), month: m[2] } : null;
}

// Extracts closure entries for Baywave specifically from the full closures page,
// which lists notices for every Bay Venues facility back to back under headings.
function parseBaywaveClosures(html) {
  // Find the "Baywave" section heading, then slice out everything from there
  // up to the next facility's heading (or a fallback cap if none is found).
  const headingMatch = html.match(/<h[1-6][^>]*>[^<]*Baywave[^<]*<\/h[1-6]>/i);
  if (!headingMatch) return [];

  const sectionStart = html.indexOf(headingMatch[0]);
  const fromBaywave = html.slice(sectionStart);

  const nextFacility = fromBaywave.search(
    /<h[1-6][^>]*>[^<]*(?:Greerton|Otumoetai|Memorial|Te\s+Puke|Dave\s+Hume|Mount\s+Hot)[^<]*<\/h[1-6]>/i
  );
  const sectionHtml = nextFacility !== -1
    ? fromBaywave.slice(0, nextFacility)
    : fromBaywave.slice(0, 8000);

  // Each closure notice is one <p> element within the Baywave section
  const pMatches = [...sectionHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];

  // Use NZ time — Vercel servers run in UTC, which is up to 13h behind NZT
  const nzDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
  const [nzYear, nzMonthIdx, nzDay] = nzDateStr.split('-').map(Number);
  const currentYear = nzYear;
  const todayDay    = nzDay;
  const todayMonth  = nzMonthIdx - 1; // 0-indexed
  const today       = new Date(nzYear, nzMonthIdx - 1, nzDay);

  return pMatches
    .map(m => {
      const pHtml = m[1];

      // Event name from <strong>
      const strongMatch = pHtml.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
      if (!strongMatch) return null;
      const event = stripTags(strongMatch[1]).trim();
      if (!event) return null;

      // Pool/area from <em> — strip "Exclusive Use of" prefix and attendance note
      const emMatch = pHtml.match(/<em[^>]*>([\s\S]*?)<\/em>/i);
      const area = emMatch
        ? stripTags(emMatch[1])
            .replace(/^Exclusive Use of\s*/i, '')
            .replace(/,?\s*\d+\s*(?:children|adults|people)\s*attending/i, '')
            .replace(/:$/, '')
            .trim()
        : '';

      // Find all date occurrences
      const text = stripTags(pHtml);
      const allDates = [...text.matchAll(DATE_RE)];
      if (allDates.length === 0) return null;

      const first = parseDay(allDates[0][0]);
      const last  = parseDay(allDates[allDates.length - 1][0]);
      if (!first) return null;

      const lastMonth   = last?.month ?? first.month;
      const lastDay     = last?.day   ?? first.day;
      const lastMonthNum = MONTHS[lastMonth.toLowerCase()];
      if (lastMonthNum === undefined) return null;

      // If the end month is earlier than the start month, the closure wraps into next year
      const firstMonthNum = MONTHS[first.month.toLowerCase()];
      const endYear = (firstMonthNum !== undefined && lastMonthNum < firstMonthNum) ? currentYear + 1 : currentYear;
      const endDate = new Date(endYear, lastMonthNum, lastDay);
      // Skip closures that have already finished
      if (endDate < today) return null;

      // Same year-rollover logic for the start date, e.g. a January notice found in November
      const startYear = (firstMonthNum !== undefined && firstMonthNum < todayMonth) ? currentYear + 1 : currentYear;
      const startDate = new Date(startYear, firstMonthNum, first.day);
      const threeMonthsAhead = new Date(nzYear, nzMonthIdx - 1 + 3, nzDay);
      // Cap the display window so far-future closures don't clutter the ticker
      if (startDate > threeMonthsAhead) return null;

      const firstAbbr = first.month.slice(0, 3);
      const lastAbbr  = lastMonth.slice(0, 3);

      let dateLabel;
      if (firstAbbr === lastAbbr) {
        dateLabel = first.day === lastDay
          ? `${firstAbbr} ${first.day}`
          : `${firstAbbr} ${first.day}–${lastDay}`;
      } else {
        dateLabel = `${firstAbbr} ${first.day} – ${lastAbbr} ${lastDay}`;
      }

      // Parse each "DayName Nth Month - startTime to endTime" line
      const DAY_TIME_RE = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s*[-–]\s*(\d{1,2}(?:\.\d{2})?(?:am|pm))\s+to\s+(\d{1,2}(?:\.\d{2})?(?:am|pm))/gi;
      const dayEntries = [...text.matchAll(DAY_TIME_RE)];

      let times = '';
      if (dayEntries.length > 0) {
        // Prefer today's specific time slot if the notice lists different times per day,
        // otherwise fall back to the first listed slot
        const todayEntry = dayEntries.find(e =>
          parseInt(e[1], 10) === todayDay && MONTHS[e[2].toLowerCase()] === todayMonth
        );
        const useEntry = todayEntry ?? dayEntries[0];
        times = `${useEntry[3]}–${useEntry[4]}`;
      }

      return { date: dateLabel, event, area, times };
    })
    .filter(Boolean);
}

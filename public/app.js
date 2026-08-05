// Drives the TV lane-availability display: polls the swimlane/pool-temp/closures
// APIs and renders the results into the grid built in index.html.
const POOL = 'Baywave';
const API  = '/api/swimlane';
const REFRESH_MS = 15 * 60 * 1000;

const SLOT_START_HOUR = 6;
const SLOT_COUNT = 32;   // 32 × 30 min = 16 hours → schedule runs 6am–10pm
const SLOT_MINUTES = 30;

// ── CLOCK ────────────────────────────────────────────────────────────────────
// Updates the header clock/date, always rendered in NZ time regardless of the
// host machine's timezone (important since this can run on any TV/PC).
function updateClock() {
  const now = new Date();
  const timeParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(now).map(({type, value}) => [type, value])
  );
  document.getElementById('clock').textContent = `${timeParts.hour}:${timeParts.minute}`;
  document.getElementById('date-display').textContent =
    new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      weekday: 'long', day: 'numeric', month: 'short', year: 'numeric'
    }).format(now);
}
updateClock();
setInterval(updateClock, 10000);

// ── DATE ────────────────────────────────────────────────────────────────────
// Today's date in NZ time as YYYY-MM-DD, used as the ?date= param for the swimlane API.
function todayNZT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
}

// ── NOW LINE ─────────────────────────────────────────────────────────────────
// Vertical position (0–100%) of the "current time" line overlaid on the grid,
// as a percentage of the way through the displayed 6am–10pm schedule.
function nowLinePercent() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      hour: 'numeric', minute: 'numeric', hour12: false
    }).formatToParts(new Date()).map(({type, value}) => [type, value])
  );
  const minutesSinceStart = (Number(parts.hour) - SLOT_START_HOUR) * 60 + Number(parts.minute);
  const totalMinutes = SLOT_COUNT * SLOT_MINUTES;
  const pct = (minutesSinceStart / totalMinutes) * 100;
  return Math.max(0, Math.min(100, pct));
}

// ── PARSE HTML ───────────────────────────────────────────────────────────────
// Parses the HTML fragment returned in data.html by the swimlane API.
// Expects ul.col.lanes elements where the first li is the lane name and
// subsequent li elements carry CSS class names like 'booked swimming'.
function parseGrid(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const laneCols = doc.querySelectorAll('ul.col.lanes');
  const lanes = [];

  laneCols.forEach(col => {
    const nameEl = col.querySelector('li:first-child');
    const name = nameEl ? nameEl.textContent.trim() : '?';
    const cells = Array.from(col.querySelectorAll('li:not(:first-child)'));
    const slots = cells.map(li => {
      const cls = li.className.trim();
      if (cls.includes('booked')) {
        if (cls.includes('swimming'))      return 'swimming';
        if (cls.includes('aqua-class'))    return 'aqua-class';
        if (cls.includes('learn-to-swim')) return 'learn-to-swim';
        if (cls.includes('water-polo'))    return 'water-polo';
        if (cls.includes('synchro'))          return 'synchro';
        if (cls.includes('schools-in-pools')) return 'schools-in-pools';
        if (cls.includes('bw-aqua-fit'))        return 'bw-aqua-fit';
        if (cls.includes('underwater-hockey')) return 'underwater-hockey';
        return 'booked';
      }
      return 'available';
    });
    lanes.push({ name, slots });
  });
  return lanes;
}

// ── TIME LABELS ──────────────────────────────────────────────────────────────
// Label for time-slot index i (e.g. "6am", "7am"). Only even (hour-aligned)
// slots get a label — odd half-hour slots return '' and stay blank in the grid.
function slotLabel(i) {
  if (i % 2 !== 0) return '';
  const totalMins = SLOT_START_HOUR * 60 + i * SLOT_MINUTES;
  const h = Math.floor(totalMins / 60);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}${ampm}`;
}

// ── RENDER ───────────────────────────────────────────────────────────────────
// Builds the full grid DOM (header row, time column, lane columns, now-line,
// and colour key) from the parsed lane data and inserts it into #grid-container.
function render(lanes) {
  const container = document.getElementById('grid-container');
  container.className = 'lane-grid';

  const headerRow = document.createElement('div');
  headerRow.className = 'lane-header-row';
  const th = document.createElement('div');
  th.className = 'time-col-header';
  headerRow.appendChild(th);
  lanes.forEach(lane => {
    const d = document.createElement('div');
    d.className = 'lane-name';
    d.textContent = lane.name;
    headerRow.appendChild(d);
  });
  container.appendChild(headerRow);

  const body = document.createElement('div');
  body.className = 'grid-body';

  const timeCol = document.createElement('div');
  timeCol.className = 'time-col';
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slot = document.createElement('div');
    slot.className = 'time-slot' + (i % 2 === 0 ? ' hour-mark' : '');
    slot.textContent = slotLabel(i);
    timeCol.appendChild(slot);
  }
  body.appendChild(timeCol);

  const lanesArea = document.createElement('div');
  lanesArea.className = 'lanes-area';
  lanesArea.id = 'lanes-area';

  lanes.forEach(lane => {
    const col = document.createElement('div');
    col.className = 'lane-col';
    lane.slots.forEach(type => {
      const cell = document.createElement('div');
      if (type === 'available') {
        cell.className = 'cell available';
      } else if (type === 'na') {
        cell.className = 'cell';
      } else {
        cell.className = `cell booked ${type}`;
      }
      col.appendChild(cell);
    });
    lanesArea.appendChild(col);
  });

  const nowLine = document.createElement('div');
  nowLine.className = 'now-line';
  nowLine.id = 'now-line';
  nowLine.style.top = nowLinePercent() + '%';
  lanesArea.appendChild(nowLine);

  body.appendChild(lanesArea);
  container.appendChild(body);

  const keyRow = document.createElement('div');
  keyRow.className = 'key-row';
  const presentTypes = new Set(lanes.flatMap(l => l.slots));
  const keyItems = [
    ['available',        'Available'],
    ['swimming',         'Swim Squad'],
    ['aqua-class',       'Aqua Class'],
    ['learn-to-swim',    'Learn to Swim'],
    ['water-polo',       'Water Polo'],
    ['synchro',          'Synchro'],
    ['schools-in-pools', 'Schools in Pools'],
    ['bw-aqua-fit',       'Aqua Fit'],
    ['underwater-hockey', 'Underwater Hockey'],
    ['booked',            'Other'],
  ].filter(([cls]) => presentTypes.has(cls));
  keyItems.forEach(([cls, label]) => {
    const item = document.createElement('div');
    item.className = 'key-item';
    const swatch = document.createElement('div');
    swatch.className = `key-swatch ${cls}`;
    const text = document.createElement('span');
    text.textContent = label;
    item.appendChild(swatch);
    item.appendChild(text);
    keyRow.appendChild(item);
  });
  container.appendChild(keyRow);
}

// ── FETCH ────────────────────────────────────────────────────────────────────
let retryTimeout = null; // pending short-interval retry after a failed fetch, so a later success can cancel it

// Fetches today's lane schedule and renders it, or shows an error message and
// schedules a 60s retry on failure (separate from the normal REFRESH_MS poll).
async function fetchLanes() {
  const date = todayNZT();
  const url = `${API}?source=${POOL}&date=${date}`;
  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(fetchTimeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error('API returned success:false');
    const lanes = parseGrid(data.html);
    if (lanes.length === 0) throw new Error('No lane data parsed');

    clearTimeout(retryTimeout);
    const container = document.getElementById('grid-container');
    container.innerHTML = '';
    render(lanes);

  } catch (err) {
    clearTimeout(fetchTimeout);
    const container = document.getElementById('grid-container');
    container.className = 'error';
    container.textContent = `Unable to load lane data — ${err.name === 'AbortError' ? 'Request timed out' : err.message}`;
    console.error(err);
    clearTimeout(retryTimeout);
    retryTimeout = setTimeout(fetchLanes, 60 * 1000);
  }
}

setInterval(() => {
  const nl = document.getElementById('now-line');
  if (nl) nl.style.top = nowLinePercent() + '%';
}, 10000);

// ── CLOSURES TICKER ───────────────────────────────────────────────────────────
// Wrapper around textContent — kept as a named helper so it reads clearly
// alongside the DOM-building calls below (and to make the "no innerHTML for
// untrusted text" intent explicit).
function safeText(el, text) { el.textContent = text; }

// Builds one pass of the ticker content (date, event, area/times) as DOM nodes.
// Called twice by fetchClosures so the strip can loop seamlessly.
function buildTickerSegment(closures) {
  const frag = document.createDocumentFragment();
  closures.forEach(({ date, event, area, times }, i) => {
    if (i > 0) {
      const diamond = document.createElement('span');
      diamond.className = 'ticker-diamond';
      diamond.textContent = '◆';
      frag.appendChild(diamond);
    }
    const item = document.createElement('span');
    item.className = 'ticker-item';

    const dateEl = document.createElement('span');
    dateEl.className = 'ticker-date';
    safeText(dateEl, date);

    const dash = document.createElement('span');
    dash.className = 'ticker-dash';
    dash.textContent = '—';

    const eventEl = document.createElement('span');
    eventEl.className = 'ticker-event';
    safeText(eventEl, event);

    item.appendChild(dateEl);
    item.appendChild(dash);
    item.appendChild(eventEl);

    const meta = [area, times].filter(Boolean).join(' · ');
    if (meta) {
      const metaEl = document.createElement('span');
      metaEl.className = 'ticker-meta';
      safeText(metaEl, '· ' + meta);
      item.appendChild(metaEl);
    }

    frag.appendChild(item);
  });
  return frag;
}

// Fetches upcoming closures and populates the scrolling ticker bar, hiding the
// bar entirely when there are none. Duplicates the content so the CSS
// translateX(-50%) loop animation has no visible seam.
async function fetchClosures() {
  const bar    = document.getElementById('closures-bar');
  const ticker = document.getElementById('closures-ticker');
  try {
    const res = await fetch('/api/closures');
    if (!res.ok) throw new Error('bad status');
    const { closures } = await res.json();

    if (!closures || closures.length === 0) {
      bar.classList.remove('visible');
      ticker.innerHTML = '';
      return;
    }

    ticker.innerHTML = '';
    ticker.style.animation = '';
    ticker.appendChild(buildTickerSegment(closures));
    ticker.appendChild(buildTickerSegment(closures)); // duplicate for seamless loop

    bar.classList.add('visible');

    // Measure after layout settles, then start animation
    setTimeout(() => {
      const halfWidth = ticker.scrollWidth / 2;
      const duration  = halfWidth > 0 ? Math.round(halfWidth / 80) : 40;
      ticker.style.animation = `ticker-scroll ${duration}s linear infinite`;
    }, 200);
  } catch (_) {}
}

// ── POOL TEMP ─────────────────────────────────────────────────────────────────
// Fetches the current lap pool temperature and writes it into the header.
async function fetchPoolTemp() {
  try {
    const res = await fetch('/api/pool-temp');
    if (!res.ok) return;
    const { temp } = await res.json();
    if (!temp) return;
    const el = document.getElementById('pool-temp');
    el.innerHTML = `LAP POOL <span class="temp-value">${temp}</span>`;
  } catch (_) {}
}

// ── HEARTBEAT ─────────────────────────────────────────────────────────────────
// Pings the server every poll cycle so check-heartbeat.js can alert if this
// display goes quiet. Sent regardless of whether fetchLanes/fetchPoolTemp
// succeed — this tracks whether the TV's browser is alive, not whether the
// upstream Baywave site is reachable.
function sendHeartbeat() {
  fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
}

// ── INIT ──────────────────────────────────────────────────────────────────────
fetchLanes();
setInterval(fetchLanes, REFRESH_MS);

sendHeartbeat();
setInterval(sendHeartbeat, REFRESH_MS);

fetchPoolTemp();
setInterval(fetchPoolTemp, REFRESH_MS);

fetchClosures();
setInterval(fetchClosures, 60 * 60 * 1000);

// Hard reload every hour so deployed code changes are picked up automatically
setInterval(() => location.reload(), 60 * 60 * 1000);

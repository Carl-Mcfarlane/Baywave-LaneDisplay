const POOL = 'Baywave';
const API  = '/api/swimlane';
const REFRESH_MS = 15 * 60 * 1000;

const SLOT_START_HOUR = 6;
const SLOT_COUNT = 32;   // 32 × 30 min = 16 hours → schedule runs 6am–10pm
const SLOT_MINUTES = 30;

// ── CLOCK ────────────────────────────────────────────────────────────────────
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
function todayNZT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
}

// ── NOW LINE ─────────────────────────────────────────────────────────────────
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
        if (cls.includes('bw-aqua-fit'))      return 'bw-aqua-fit';
        return 'booked';
      }
      return 'available';
    });
    lanes.push({ name, slots });
  });
  return lanes;
}

// ── TIME LABELS ──────────────────────────────────────────────────────────────
function slotLabel(i) {
  if (i % 2 !== 0) return '';
  const totalMins = SLOT_START_HOUR * 60 + i * SLOT_MINUTES;
  const h = Math.floor(totalMins / 60);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}${ampm}`;
}

// ── RENDER ───────────────────────────────────────────────────────────────────
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
    ['bw-aqua-fit',      'Aqua Fit'],
    ['booked',           'Other Booking'],
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
let retryTimeout = null;

async function fetchLanes() {
  const date = todayNZT();
  const url = `${API}?source=${POOL}&date=${date}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error('API returned success:false');
    const lanes = parseGrid(data.html);
    if (lanes.length === 0) throw new Error('No lane data parsed');

    const container = document.getElementById('grid-container');
    container.innerHTML = '';
    render(lanes);

  } catch (err) {
    const container = document.getElementById('grid-container');
    container.className = 'error';
    container.textContent = `Unable to load lane data — ${err.message}`;
    console.error(err);
    clearTimeout(retryTimeout);
    retryTimeout = setTimeout(fetchLanes, 60 * 1000);
  }
}

setInterval(() => {
  const nl = document.getElementById('now-line');
  if (nl) nl.style.top = nowLinePercent() + '%';
}, 10000);

// ── INIT ──────────────────────────────────────────────────────────────────────
fetchLanes();
setInterval(fetchLanes, REFRESH_MS);

// Hard reload every hour so deployed code changes are picked up automatically
setInterval(() => location.reload(), 60 * 60 * 1000);

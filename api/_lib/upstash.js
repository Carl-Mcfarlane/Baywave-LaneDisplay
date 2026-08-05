// Thin wrapper around the Upstash Redis REST API, shared by heartbeat.js and
// check-heartbeat.js. Lives under _lib/ so Vercel doesn't treat it as a route.
// Vercel's Upstash-for-Redis marketplace integration injects these under the
// KV_REST_API_* names (a holdover from the old first-party Vercel KV product),
// not the UPSTASH_REDIS_REST_* names Upstash's own docs use.
const BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

async function call(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash returned ${res.status}`);
  const data = await res.json();
  return data.result;
}

function redisGet(key) {
  return call(`/get/${key}`);
}

function redisSet(key, value) {
  return call(`/set/${key}/${encodeURIComponent(value)}`);
}

function redisDel(key) {
  return call(`/del/${key}`);
}

module.exports = { redisGet, redisSet, redisDel };

// GET /api/ics?url=<webcal:// or https:// ICS subscription link>
//
// Fetches an ICS calendar feed server-side (avoids CORS) and returns a
// flat list of events as JSON. Works with Apple/iCloud "Public Calendar"
// share links (Calendar app -> right-click calendar -> Share Calendar ->
// Public Calendar -> copy link). Read-only, no credentials needed.

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const params = new URL(req.url, 'http://x').searchParams;
  let url = (params.get('url') || '').trim();
  if (!url) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'no_url' })); return; }
  url = url.replace(/^webcal:\/\//i, 'https://');

  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Nexus Calendar Sync)' } });
    if (!r.ok) { res.statusCode = 200; res.end(JSON.stringify({ ok: false, error: 'fetch_failed_' + r.status })); return; }
    const text = await r.text();
    const events = parseIcs(text);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, events }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, error: e.message || 'unknown' }));
  }
};

function parseIcs(text) {
  // Unfold lines (ICS continues a line with a leading space/tab).
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
  const events = [];
  blocks.forEach((block) => {
    const summaryM = block.match(/SUMMARY:([^\n]*)/);
    const dtM = block.match(/DTSTART[^:]*:([^\n]*)/);
    if (!summaryM || !dtM) return;
    const title = summaryM[1].trim();
    const dateKey = parseIcsDate(dtM[1].trim());
    if (!dateKey) return;
    events.push({ title, dateKey });
  });
  return events.slice(0, 2000); // sane cap
}

function parseIcsDate(raw) {
  // Formats seen: 20260624T180000Z, 20260624T180000, 20260624
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return m[1] + '-' + m[2] + '-' + m[3];
}

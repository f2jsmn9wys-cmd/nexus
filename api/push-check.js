// GET /api/push-check — the cron target (point cron-job.org at this URL,
// once a minute). Looks at today's calendar events that have a clock time
// attached (AI-scheduled ones do), and sends a Web Push reminder ~5 minutes
// before each one — exactly once per event, ever.

const { sendToAll } = require('./push-send');

const SB_URL = (process.env.SUPABASE_URL || '').trim();
const SB_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const SNAP_KEY = 'nexus-device-snapshot';
const LEAD_MINUTES = 5;

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (!SB_URL || !SB_KEY) { res.statusCode = 200; res.end(JSON.stringify({ ok:false, error:'not_configured' })); return; }

  try {
    const snapR = await fetch(SB_URL + '/rest/v1/app_state?key=eq.' + SNAP_KEY + '&select=data', {
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
    });
    const snapJ = await snapR.json();
    const blob = (snapJ && snapJ[0] && snapJ[0].data && snapJ[0].data.blob) || {};
    let events = {};
    try { events = JSON.parse(blob.nexus_events_v1 || '{}'); } catch (_) { events = {}; }

    const now = new Date();
    const todayKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const todays = events[todayKey] || [];

    let sentCount = 0;
    for (const ev of todays) {
      if (!ev.time) continue; // only AI-scheduled / timed events trigger reminders
      const [hh, mm] = ev.time.split(':').map(Number);
      const at = new Date(now); at.setHours(hh, mm, 0, 0);
      const minsUntil = (at - now) / 60000;
      if (minsUntil > LEAD_MINUTES || minsUntil < LEAD_MINUTES - 1) continue; // only fire in a ~1min window

      const signature = todayKey + '|' + ev.time + '|' + ev.title;
      const exists = await fetch(SB_URL + '/rest/v1/notified_events?signature=eq.' + encodeURIComponent(signature) + '&select=signature', {
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      }).then(r => r.json());
      if (exists && exists.length) continue;

      await sendToAll({ title: '⏰ ' + ev.title, body: 'In ' + LEAD_MINUTES + ' Minuten, um ' + ev.time + ' Uhr.', tag: signature });
      await fetch(SB_URL + '/rest/v1/notified_events', {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'content-type':'application/json', Prefer:'resolution=merge-duplicates' },
        body: JSON.stringify({ signature }),
      });
      sentCount++;
    }
    res.statusCode = 200; res.end(JSON.stringify({ ok:true, checked: todays.length, sent: sentCount }));
  } catch (e) {
    res.statusCode = 200; res.end(JSON.stringify({ ok:false, error: e.message }));
  }
};

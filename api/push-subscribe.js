// POST /api/push-subscribe — stores a browser's Web Push subscription so
// /api/push-check (called by an external cron, e.g. cron-job.org) can send
// reminders to every registered device.
//
// Env vars: SUPABASE_URL, SUPABASE_ANON_KEY

const SB_URL = (process.env.SUPABASE_URL || '').trim();
const SB_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ ok:false })); return; }
  if (!SB_URL || !SB_KEY) { res.statusCode = 200; res.end(JSON.stringify({ ok:false, error:'not_configured' })); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const sub = body && body.subscription;
  if (!sub || !sub.endpoint) { res.statusCode = 400; res.end(JSON.stringify({ ok:false, error:'no_subscription' })); return; }

  try {
    await fetch(SB_URL + '/rest/v1/push_subscriptions', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'content-type':'application/json', Prefer:'resolution=merge-duplicates' },
      body: JSON.stringify({ endpoint: sub.endpoint, subscription: sub }),
    });
    res.statusCode = 200; res.end(JSON.stringify({ ok:true }));
  } catch (e) {
    res.statusCode = 200; res.end(JSON.stringify({ ok:false, error: e.message }));
  }
};

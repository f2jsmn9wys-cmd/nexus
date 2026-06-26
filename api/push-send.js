// Shared helper: sends a Web Push notification to every stored subscription.
// Used by api/push-check.js (the cron target). Not meant to be called directly
// from the browser (no auth) — exported as a plain function, not a route.

const webpush = require('web-push');

const SB_URL = (process.env.SUPABASE_URL || '').trim();
const SB_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim();

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error('vapid_not_configured');
  webpush.setVapidDetails('mailto:nexus@example.com', VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

async function getSubscriptions() {
  const r = await fetch(SB_URL + '/rest/v1/push_subscriptions?select=subscription,endpoint', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
  });
  return r.json();
}
async function removeSubscription(endpoint) {
  await fetch(SB_URL + '/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(endpoint), {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
  });
}

async function sendToAll(payload) {
  ensureConfigured();
  const rows = await getSubscriptions();
  let sent = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload));
      sent++;
    } catch (e) {
      // 404/410 = the subscription is dead (user uninstalled, cleared data, …) — drop it.
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await removeSubscription(row.endpoint);
    }
  }
  return sent;
}

module.exports = { sendToAll };

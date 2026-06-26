// GET /api/config — serves this deploy's PUBLIC Supabase config to the browser.
//
// Set these in Vercel → Project → Settings → Environment Variables:
//   SUPABASE_URL       = https://YOUR-PROJECT.supabase.co
//   SUPABASE_ANON_KEY  = eyJ... (anon public key)
//
// Without them set, the app stays local-only until keys are pasted via the
// ☁ Cloud sync panel in the browser itself.
module.exports = (req, res) => {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'public, max-age=60, s-maxage=300');
  res.statusCode = 200;
  res.end(JSON.stringify({ url, key }));
};

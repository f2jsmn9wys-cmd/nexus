// POST /api/brain — the conversational layer over the Second Brain.
//
// You just talk to it. Claude decides, per message:
//   - it's a new thought/info worth keeping  -> files it as a note
//   - it's a question / asks for help        -> answers using your notes
//                                                AND your todos as context
//   - you confirm "plan that into my calendar"-> schedules your todos for
//                                                tomorrow at sensible times
//
// Env var needed: ANTHROPIC_API_KEY
//
// Body: { message, notes:[{title,body,tags}], todos:[{text,priority,done}], history:[{role,text}] }
// Reply: { ok, action: 'save_note'|'answer'|'schedule_todos', title?, body?, items?, reply }

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' })); return; }
  if (!ANTHROPIC_KEY) { res.statusCode = 200; res.end(JSON.stringify({ ok: false, error: 'not_configured' })); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const message = ((body && body.message) || '').trim();
  const notes = Array.isArray(body && body.notes) ? body.notes : [];
  const todos = Array.isArray(body && body.todos) ? body.todos : [];
  const history = Array.isArray(body && body.history) ? body.history.slice(-10) : [];
  if (!message) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'no_message' })); return; }

  const notesContext = notes.slice(-60).map((n, i) =>
    '[#' + i + '] ' + (n.title || 'Notiz') + (n.tags && n.tags.length ? ' (Tags: ' + n.tags.join(', ') + ')' : '') + '\n' + String(n.body || '').slice(0, 400)
  ).join('\n\n');
  const todosContext = todos.length
    ? todos.map(t => '- [' + (t.done ? 'x' : ' ') + '] (' + t.priority + ') ' + t.text).join('\n')
    : '(keine offenen Todos)';

  const now = new Date();
  const todayStr = now.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long' });

  const sys = 'Du bist das persoenliche "Second Brain" des Nutzers — ruhig, praezise, hilfsbereit. Heute ist ' + todayStr + '.\n\n' +
    'Du bekommst: seine bisherigen NOTIZEN, seine offenen TODOS, den bisherigen CHATVERLAUF, dann seine neue Nachricht.\n\n' +
    'Entscheide GENAU EINE Aktion:\n\n' +
    '(a) Die Nachricht ist ein NEUER Gedanke/Idee/Information, die es wert ist, gespeichert zu werden (auch lose formuliert) ->\n' +
    '{"action":"save_note","title":"<kurzer Titel>","body":"<aufgeraeumte Version>","reply":"<kurze Bestaetigung>"}\n\n' +
    '(b) Die Nachricht ist eine FRAGE / bittet um Hilfe oder eine Einordnung anhand der Notizen UND/ODER Todos ' +
    '(z.B. "was hab ich morgen vor", "fass mir X zusammen") ->\n' +
    '{"action":"answer","reply":"<konkrete Antwort, nimm explizit Bezug auf relevante Notizen [#i] oder Todos>"}\n\n' +
    '(c) Der Nutzer bestaetigt im Chatverlauf gerade, dass TODOS in den Kalender eingeplant werden sollen ' +
    '(z.B. "ja bitte einplanen", "plan das ein") -> waehle sinnvolle Uhrzeiten fuer MORGEN (heute ist ' + todayStr + ', also morgen einen Tag spaeter) ' +
    'fuer die relevanten offenen Todos (nutze 24h-Format HH:MM, realistische Abstaende, z.B. ab 9:00, je 30-90min je nach Aufgabe) ->\n' +
    '{"action":"schedule_todos","items":[{"text":"<Todo-Text>","time":"HH:MM"}],"reply":"<kurze Bestaetigung, was eingeplant wurde>"}\n\n' +
    'Antworte AUSSCHLIESSLICH mit kompaktem JSON, keine Erklaerung, kein Markdown-Codeblock.\n\n' +
    'NOTIZEN:\n' + (notesContext || '(noch keine)') + '\n\nTODOS:\n' + todosContext;

  const messages = history.map(h => ({ role: h.role === 'ai' ? 'assistant' : 'user', content: h.text }))
    .concat([{ role: 'user', content: message }]);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200, system: sys, messages }),
    });
    const j = await r.json();
    const out = (j && j.content && j.content[0] && j.content[0].text) || '';
    const m = out.match(/\{[\s\S]*\}/);
    let parsed = null;
    try { parsed = m ? JSON.parse(m[0]) : null; } catch (_) { parsed = null; }
    if (!parsed || !parsed.action) {
      res.statusCode = 200; res.end(JSON.stringify({ ok: true, action: 'answer', reply: out || 'Verstanden.' })); return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true, action: parsed.action, title: parsed.title, body: parsed.body,
      items: parsed.items, reply: parsed.reply || '',
    }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, error: e.message || 'unknown' }));
  }
};

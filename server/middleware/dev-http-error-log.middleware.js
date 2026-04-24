/**
 * Logs one line per 4xx/5xx JSON response in non-production so the terminal
 * shows the same message the client receives (without dumping full bodies).
 */
function formatBodySummary(body) {
  if (body == null) return '(empty body)';
  if (typeof body === 'string') {
    return body.length > 400 ? `${body.slice(0, 400)}…` : body;
  }
  if (typeof body === 'object') {
    const msg = body.error ?? body.message;
    const code = body.code;
    if (msg != null && code != null) return `${msg} (${code})`;
    if (msg != null) return String(msg);
    try {
      const s = JSON.stringify(body);
      return s.length > 400 ? `${s.slice(0, 400)}…` : s;
    } catch {
      return '[unserializable body]';
    }
  }
  return String(body);
}

function devHttpErrorLog(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = function devLoggedJson(body) {
    if (res.statusCode >= 400) {
      const summary = formatBodySummary(body);
      console.error(`[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} — ${summary}`);
    }
    return originalJson(body);
  };

  next();
}

module.exports = { devHttpErrorLog };

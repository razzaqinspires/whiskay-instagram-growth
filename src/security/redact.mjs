const SECRET_KEYS = /password|passwd|token|cookie|authorization|session|secret|api.?key/i;
const AUTHORIZATION_ASSIGNMENT = /\bauthorization\b(\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?[^\s,;]+/gi;
const SECRET_ASSIGNMENT = /\b(password|passwd|access[_-]?token|refresh[_-]?token|token|cookie|authorization|session|secret|api[_-]?key|client[_-]?secret)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_QUERY = /([?&](?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|key|secret|password|passwd|authorization|session)=)[^&#\s]*/gi;
const URL_USERINFO = /(https?:\/\/)[^\s/@]+@/gi;
const JWT = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

function safeLabel(value, fallback, maxLength = 64) {
  const candidate = String(value ?? '');
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate)
    ? candidate.slice(0, maxLength)
    : fallback;
}

export function redactText(input, maxLength = 500) {
  let message = String(input ?? 'Unknown error');
  message = message
    .replace(AUTHORIZATION_ASSIGNMENT, 'authorization$1[REDACTED]')
    .replace(AUTH_SCHEME, '$1 [REDACTED]')
    .replace(SECRET_ASSIGNMENT, '$1$2[REDACTED]')
    .replace(SENSITIVE_QUERY, '$1[REDACTED]')
    .replace(URL_USERINFO, '$1[REDACTED]@')
    .replace(JWT, '[REDACTED_JWT]');

  if (message.length > maxLength) message = `${message.slice(0, maxLength)}…[TRUNCATED]`;
  return message;
}

export function redactObject(input, depth = 0) {
  if (depth > 6) return '[MAX_DEPTH]';
  if (Array.isArray(input)) return input.slice(0, 50).map(value => redactObject(value, depth + 1));
  if (!input || typeof input !== 'object') {
    if (typeof input === 'string' && input.length > 1000) return redactText(input, 1000);
    return input;
  }
  const output = {};
  for (const [key, value] of Object.entries(input).slice(0, 100)) {
    output[key] = SECRET_KEYS.test(key)
      ? '[REDACTED]'
      : redactObject(value, depth + 1);
  }
  return output;
}

export function sanitizeError(error) {
  const rawMessage = error?.message ?? error ?? 'Unknown error';
  return {
    name: safeLabel(error?.name, 'Error'),
    code: safeLabel(error?.code, 'UNKNOWN'),
    message: redactText(rawMessage, 500),
  };
}

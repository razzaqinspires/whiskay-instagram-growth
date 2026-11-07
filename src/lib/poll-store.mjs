const MAX_POLL_MESSAGES = 5000;
const pollMessages = new Map();

function cacheKey(key) {
  if (!key?.id) return null;
  return key.remoteJid ? `${key.remoteJid}:${key.id}` : String(key.id);
}

export function rememberPollCreationMessage(message) {
  const key = cacheKey(message?.key);
  if (!key || !message?.message?.pollCreationMessage) return false;
  pollMessages.set(key, message);
  if (pollMessages.size > MAX_POLL_MESSAGES) {
    const excess = pollMessages.size - MAX_POLL_MESSAGES;
    const iterator = pollMessages.keys();
    for (let i = 0; i < excess; i += 1) {
      const item = iterator.next();
      if (item.done) break;
      pollMessages.delete(item.value);
    }
  }
  return true;
}

export function getPollCreationMessage(key) {
  const direct = cacheKey(key);
  return (direct && pollMessages.get(direct)?.message) || pollMessages.get(String(key?.id || ''))?.message || undefined;
}

export function pollCacheStats() {
  return { storedPolls: pollMessages.size, limit: MAX_POLL_MESSAGES };
}

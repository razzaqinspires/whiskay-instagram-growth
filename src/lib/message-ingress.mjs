/**
 * Classifies Baileys messages.upsert batches for command dispatch.
 * Baileys uses `notify` for live traffic and `append` for history/backfill.
 * History batches are discarded before parsing to avoid replay and needless
 * work on large initial-sync batches.
 */
export function classifyMessageUpsert(event = {}, { isCommand = () => true } = {}) {
  const type = typeof event.type === 'string' ? event.type : 'unknown';
  const messages = Array.isArray(event.messages) ? event.messages : [];
  const live = type === 'notify';
  const commandMessages = [];
  let withContent = 0;
  let fromMeCount = 0;
  let alternateAddressCount = 0;

  for (const message of messages) {
    if (!message?.message || !message?.key?.remoteJid) continue;
    withContent += 1;
    if (message.key.fromMe === true) fromMeCount += 1;
    if (message.key.remoteJidAlt || message.key.remoteJidPn || message.key.participantAlt || message.key.participantPn) {
      alternateAddressCount += 1;
    }

    // Historical/unknown batches are never command input and should not be
    // parsed. This avoids doing prefix parsing over thousands of backfilled
    // messages when WhatsApp performs an initial sync.
    if (!live) continue;

    try {
      if (isCommand(message)) commandMessages.push(message);
    } catch {
      // A malformed/unexpected message is ignored; it must not break the event listener.
    }
  }

  return {
    type,
    total: messages.length,
    withContent,
    fromMeCount,
    alternateAddressCount,
    commandLikeCount: commandMessages.length,
    messages: live ? commandMessages : []
  };
}

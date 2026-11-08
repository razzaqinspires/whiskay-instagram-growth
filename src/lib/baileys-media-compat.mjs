/**
 * Targeted transport for View Once media on the pinned Baileys 7.0.0-rc14.
 * The postinstall patch normalizes the wrapped message before Baileys chooses
 * the stanza mediatype; this function adds the client-side view_once meta node.
 */
export async function sendViewOnceMedia(sock, jid, content, quoted = null, { baileys: injectedBaileys } = {}) {
  const baileys = injectedBaileys || await import('@whiskeysockets/baileys');
  if (typeof baileys.generateWAMessage !== 'function') throw new TypeError('Baileys tidak menyediakan generateWAMessage untuk View Once.');
  if (typeof sock?.relayMessage !== 'function' || typeof sock?.waUploadToServer !== 'function') {
    throw new TypeError('View Once memerlukan relayMessage dan waUploadToServer.');
  }
  const targetJid = typeof sock.decodeJid === 'function' ? sock.decodeJid(jid) : jid;
  const userJid = sock.user?.id || sock.authState?.creds?.me?.id;
  if (!targetJid || !userJid) throw new TypeError('JID tujuan atau identitas akun WhatsApp tidak tersedia.');
  const messageId = typeof baileys.generateMessageIDV2 === 'function' ? baileys.generateMessageIDV2(userJid) : undefined;
  const generated = await baileys.generateWAMessage(targetJid, { ...content, viewOnce: true }, {
    userJid,
    messageId,
    timestamp: new Date(),
    upload: sock.waUploadToServer,
    logger: sock.logger,
    quoted: quoted || undefined
  });
  if (!generated?.message || !generated?.key?.id) throw new Error('Baileys tidak menghasilkan View Once WAMessage yang valid.');
  await sock.relayMessage(targetJid, generated.message, {
    messageId: generated.key.id,
    additionalNodes: [{ tag: 'meta', attrs: { view_once: 'true' } }]
  });
  return { ...generated, transport: 'View Once relay + meta:view_once' };
}

export default sendViewOnceMedia;

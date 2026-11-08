import path from 'node:path';
process.umask(0o077); // Create new session/state files as owner-only by default.
import { connectWA, closeWA } from './src/wa.mjs';
import { handleMessage, runtimeModeStore } from './src/commands.mjs';
import { PluginLoader } from './src/lib/plugin-loader.mjs';
import { config, assertRuntimeConfig } from './src/config.mjs';
import { sanitizeError } from './src/security/redact.mjs';
import { inspectInstagramSetup } from './src/instagram.mjs';
import { startReferralWebhookServer } from './src/referral/webhook-server.mjs';

let pluginLoader;
let referralWebhookServer;
let stopping = false;
let shutdownPromise;
let exitCode = 0;

function shutdown(code = 0) {
  if (code !== 0) exitCode = code;
  if (shutdownPromise) return shutdownPromise;
  stopping = true;

  const forceTimer = setTimeout(() => {
    console.error('[shutdown] Grace period exceeded; forcing bot process exit.');
    process.exit(exitCode || 1);
  }, 14_000);
  forceTimer.unref?.();

  shutdownPromise = (async () => {
    console.log('\n[shutdown] Menutup plugin watcher dan koneksi WhatsApp...');
    pluginLoader?.close();
    await referralWebhookServer?.close().catch(error => console.warn('[REFERRAL] Webhook server close failed:', sanitizeError(error).message));
    await closeWA();
  })().catch(error => {
    console.error('[shutdown] Gagal menyelesaikan graceful shutdown:', sanitizeError(error));
    if (exitCode === 0) exitCode = 1;
  }).finally(() => {
    clearTimeout(forceTimer);
    process.exitCode = exitCode;
  });
  return shutdownPromise;
}

// Keep listeners installed throughout shutdown. A second Ctrl+C must not
// silently fall back to Node's default signal termination while cleanup runs.
process.on('SIGINT', () => { void shutdown(0); });
process.on('SIGTERM', () => { void shutdown(0); });
process.on('SIGTSTP', () => { void shutdown(0); });

async function main() {
  assertRuntimeConfig(config);
  console.log('[WHISKAY IG GROWTH] Starting...');
  const accessMode = await runtimeModeStore.get();
  console.log(`[CONFIG] Node ${process.version}; prefixes=${config.commands.prefixes.join(' ')}; anti-spam=${config.antiSpam.enabled ? 'on' : 'off'}; mode=${accessMode.mode}; groups=${accessMode.mode === 'self' && accessMode.allowGroups ? 'owner-only' : 'off'}`);
  try {
    const instagram = await inspectInstagramSetup();
    console.log(`[INSTAGRAM] Local session state: ${instagram.status}. Startup does not contact Instagram; an existing session is loaded lazily by .igprofile/.igsync.`);
  } catch (error) {
    console.warn('[INSTAGRAM] Local session inspection skipped:', sanitizeError(error).message);
  }

  // Publish the loader reference before awaiting startup. If SIGINT arrives
  // while plugins are loading, shutdown can mark it closed immediately and
  // start() will not install a watcher after shutdown has begun.
  if (config.referral.webhook.enabled) {
    referralWebhookServer = await startReferralWebhookServer();
  }

  pluginLoader = new PluginLoader({
    directory: config.plugins.directory,
    sourceRoot: path.dirname(config.plugins.directory),
  });
  await pluginLoader.start({ watchFiles: config.plugins.hotReload });
  if (stopping) {
    pluginLoader.close();
    return;
  }

  await connectWA({
    onMessage: (sock, msg, context) => handleMessage(sock, msg, {
      ...context,
      pluginLoader
    })
  });
  if (stopping) return;
  console.log('[WHISKAY IG GROWTH] Runtime active. Waiting for WhatsApp connection and owner commands.');
}

main().catch(error => {
  console.error('[WHISKAY IG GROWTH] Fatal:', sanitizeError(error));
  void shutdown(1);
});

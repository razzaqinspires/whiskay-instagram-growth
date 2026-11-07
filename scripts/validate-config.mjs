import { config, assertRuntimeConfig } from '../src/config.mjs';
try {
  assertRuntimeConfig(config);
  console.log('[CONFIG] valid');
  console.log(`Node: ${process.version}`);
  console.log(`Prefix: ${config.commands.prefixes.join(' ')}`);
  console.log(`Instagram session: ${config.instagram.sessionFile}`);
  console.log(`Instagram safety state: ${config.instagram.guardFile}`);
  console.log(`Anti-spam: ${config.antiSpam.enabled ? 'enabled' : 'disabled'}`);
  console.log(`Config file: ./config/app.json`);
  console.log(`Plugin directory: ${config.plugins.directory}`);
  console.log('Secrets: credential values are never displayed.');
  const obsoleteEnv = ['REDIS_PASSWORD', 'IG_USERNAME', 'IG_SESSION_FILE', 'WA_PAIRING_NUMBER', 'WA_SESSION_DIR', 'WA_SYNC_FULL_HISTORY', 'LID_MAP_FILE', 'LOG_LEVEL'];
  for (const key of obsoleteEnv) {
    if (process.env[key]) console.warn(`[CONFIG] ${key} terdeteksi tetapi bukan sumber konfigurasi runtime aktif; hapus dari .env dan gunakan config/app.json.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

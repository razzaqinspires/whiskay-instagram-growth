import { config, assertRuntimeConfig } from '../src/config.mjs';

assertRuntimeConfig(config);
console.log(JSON.stringify({
  app: config.app,
  whatsapp: {
    pairingNumber: `${config.whatsapp.pairingNumber.slice(0, 4)}••••••`,
    ownerNumber: `${config.whatsapp.ownerNumber.slice(0, 4)}••••••`,
    sessionDir: config.whatsapp.sessionDir
  },
  commands: config.commands,
  plugins: config.plugins,
  antiSpam: config.antiSpam,
  instagram: {
    username: config.instagram.username,
    pythonBin: config.instagram.pythonBin,
    sessionFile: config.instagram.sessionFile,
    statsFile: config.instagram.statsFile,
    guardFile: config.instagram.guardFile,
    passwordPresent: Boolean(process.env.IG_PASSWORD)
  },
  growth: config.growth,
  identity: config.identity,
  secrets: {
    IG_PASSWORD: process.env.IG_PASSWORD ? '[SET]' : '[EMPTY]',
    REDIS_PASSWORD: process.env.REDIS_PASSWORD ? '[OBSOLETE / UNUSED]' : '[EMPTY]'
  }
}, null, 2));

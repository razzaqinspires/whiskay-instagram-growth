import { PluginLoader } from '../src/lib/plugin-loader.mjs';
import { config, assertRuntimeConfig } from '../src/config.mjs';
import { OWNER_CODE_PREFIXES, parseOwnerCodeRequest } from '../src/lib/owner-code-runtime.mjs';

const failures = [];
const report = (name, ok, detail = '') => {
  const state = ok === 'SETUP' ? 'SETUP' : (ok ? 'PASS' : 'FAIL');
  console.log(`${state} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

try {
  assertRuntimeConfig(config);
  report('runtime configuration', true, 'config/app.json accepted');
} catch (error) {
  // Missing operator numbers are an installation/setup state, not a plugin
  // registry regression. `npm run validate` remains the strict config gate.
  const incomplete = /whatsapp\.(?:pairingNumber|ownerNumber)/i.test(error.message);
  report('runtime configuration', incomplete ? 'SETUP' : false, error.message);
}

const specialRuntimePrefixesValid = ['>', '=>', '$', '>>', '>>>'].every(prefix => OWNER_CODE_PREFIXES.includes(prefix));
const parserOrderValid = parseOwnerCodeRequest('>>> package main')?.runtime === 'golang'
  && parseOwnerCodeRequest('>> print(1)')?.runtime === 'python'
  && parseOwnerCodeRequest('=> 1')?.runtime === 'eval-return'
  && parseOwnerCodeRequest('> return 1')?.runtime === 'eval-async'
  && parseOwnerCodeRequest('$ pwd')?.runtime === 'shell';
report('owner runtime special-prefix parser', specialRuntimePrefixesValid && parserOrderValid, OWNER_CODE_PREFIXES.join(' '));

const loader = new PluginLoader({ logger: { info() {}, warn: console.warn, error: console.error } });
try {
  await loader.start({ watchFiles: false });
  const status = loader.status();
  const commands = loader.listCommands();
  const byName = new Map(commands.map(command => [command.name, command]));
  report('plugin registry non-empty', commands.length > 0, `${status.plugins} plugins, ${commands.length} commands`);

  const required = ['waform', 'tiktok', 'aiscrape', 'katabg'];
  for (const name of required) report(`command .${name}`, byName.has(name), byName.has(name) ? byName.get(name).plugin : 'not registered');

  const aliasChecks = [
    ['waform', ['waui', 'wabuttons']],
    ['aiscrape', ['irfanscrape', 'scrapeai']],
    ['katabg', ['katabangwaindah', 'windahcanvas']],
  ];
  for (const [name, aliases] of aliasChecks) {
    const command = byName.get(name);
    for (const alias of aliases) report(`alias .${alias}`, Boolean(command?.aliases.includes(alias)), `target .${name}`);
  }

  report('no duplicate active command keys', new Set(commands.flatMap(command => [command.name, ...command.aliases])).size === commands.reduce((n, command) => n + 1 + command.aliases.length, 0));
  report('owner runtime excluded from plugin command list', !commands.some(command => /^(?:eval|exec|python|golang|go)$/.test(command.name))); 
} catch (error) {
  report('plugin registry startup', false, error.stack || error.message);
} finally {
  loader.close();
}

console.log(`\nRuntime smoke: ${failures.length ? `${failures.length} failure(s)` : 'all registry checks passed (SETUP notices may remain)'}`);
if (failures.length) process.exitCode = 1;

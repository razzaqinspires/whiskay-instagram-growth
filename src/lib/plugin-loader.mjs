import { mkdir, readdir, stat, cp, rm, symlink } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../config.mjs';

const isPluginFile = name => typeof name === 'string' && path.basename(name) === name && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}\.mjs$/.test(name) && !name.startsWith('.');
const WATCHABLE_SOURCE = /\.(?:mjs|js|cjs|json)$/i;

// These modules own process-wide state or derive paths from PROJECT_ROOT. Keep
// them resolved to the live source tree while stateless plugin dependencies are
// loaded from a versioned source snapshot.
const SHARED_RUNTIME_MODULES = [
  'config.mjs',
  'commands.mjs',
  'lib/command-recommender.mjs',
  'instagram.mjs',
  'lib/lid-manager.mjs',
  'lib/poll-store.mjs',
  'lib/spr-message-store.mjs',
  'growth/store.mjs',
  'referral/bot.mjs',
  'referral/queue-processor.mjs',
];

function normalizePlugin(mod, file) {
  const plugin = mod.default ?? mod.plugin;
  if (!plugin || typeof plugin !== 'object') throw new TypeError(`Plugin ${file} harus export default object`);
  const name = String(plugin.name || path.basename(file, '.mjs')).trim();
  if (!name) throw new TypeError(`Plugin ${file} tidak memiliki nama`);
  if (!Array.isArray(plugin.commands)) throw new TypeError(`Plugin ${name} harus memiliki commands: []`);
  if (plugin.commands.length > config.plugins.maxCommandsPerPlugin) throw new RangeError(`Plugin ${name} melebihi batas 100 command.`);

  const commands = plugin.commands.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || typeof entry.execute !== 'function') {
      throw new TypeError(`Command ke-${index + 1} pada ${name} harus memiliki execute()`);
    }
    const commandName = String(entry.name || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(commandName)) throw new TypeError(`Nama command tidak valid pada plugin ${name}: ${entry.name}`);
    const aliases = (entry.aliases || []).map(alias => String(alias).trim().toLowerCase());
    for (const alias of aliases) if (!/^[a-z0-9][a-z0-9_-]*$/.test(alias)) throw new TypeError(`Alias tidak valid pada plugin ${name}: ${alias}`);
    if (aliases.length > 10) throw new RangeError(`Command ${commandName} memiliki lebih dari 10 alias.`);
    const category = String(entry.category || plugin.category || 'General').trim() || 'General';
    const usage = String(entry.usage || '').trim();
    const description = String(entry.description || '').trim();
    if (category.length > 48 || usage.length > 180 || description.length > 180) throw new RangeError(`Metadata command ${commandName} terlalu panjang.`);
    return { ...entry, name: commandName, aliases, category, usage, description };
  });

  const keys = new Set();
  for (const command of commands) {
    for (const key of [command.name, ...command.aliases]) {
      if (keys.has(key)) throw new Error(`Command/alias duplikat "${key}" dalam plugin ${name}`);
      keys.add(key);
    }
  }
  return { name, commands };
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export class PluginLoader {
  #directory;
  #sourceRoot;
  #runtimeDirectory;
  #logger;
  #registry = new Map();
  #plugins = new Map();
  #watchers = new Map();
  #pluginWatcher;
  #timers = new Map();
  #closed = false;
  #generation = 0;
  #activeSnapshot = null;
  #snapshotHistory = [];
  #lastSourceChange = null;
  #lastReloadAt = null;
  #lastReloadResult = 'not-started';

  constructor({ directory = config.plugins.directory, sourceRoot = null, runtimeDirectory = null, logger = console } = {}) {
    this.#directory = path.resolve(directory);
    this.#sourceRoot = sourceRoot ? path.resolve(sourceRoot) : null;
    if (this.#sourceRoot && !isInside(this.#sourceRoot, this.#directory)) {
      throw new TypeError('Plugin directory harus berada di dalam sourceRoot untuk dependency-aware hot reload.');
    }
    this.#runtimeDirectory = runtimeDirectory
      ? path.resolve(runtimeDirectory)
      : (this.#sourceRoot ? path.join(path.dirname(this.#sourceRoot), '.whiskay-runtime', 'hot-modules') : null);
    this.#logger = logger;
  }

  async start({ watchFiles = true } = {}) {
    if (this.#closed) return this;
    await mkdir(this.#directory, { recursive: true });
    if (this.#closed) return this;

    if (this.#sourceRoot) {
      await mkdir(this.#sourceRoot, { recursive: true });
      await this.#reloadFromSnapshot({ initial: true, reason: 'startup' });
      if (watchFiles && !this.#closed) await this.#watchSourceTree();
    } else {
      const names = await readdir(this.#directory);
      for (const name of names.filter(isPluginFile)) {
        if (this.#closed) break;
        await this.loadFile(name);
      }
      if (watchFiles && !this.#closed) {
        this.#pluginWatcher = watch(this.#directory, (event, filename) => {
          const name = filename?.toString();
          if (!name) return this.#scheduleReloadAll();
          if (isPluginFile(name)) this.#scheduleFile(name);
        });
        this.#pluginWatcher.on('error', error => this.#logger.error?.('[PLUGIN] watcher error:', error.message));
      }
    }
    this.#logger.info?.(`[PLUGIN] loaded ${this.#plugins.size} plugin(s), ${this.#registry.size} command(s)`);
    return this;
  }

  async #createSnapshot() {
    const generation = `gen-${Date.now()}-${process.pid}-${++this.#generation}`;
    const root = path.join(this.#runtimeDirectory, generation);
    const stagedSource = path.join(root, 'src');
    await mkdir(this.#runtimeDirectory, { recursive: true, mode: 0o700 });
    await mkdir(root, { recursive: true, mode: 0o700 });
    await cp(this.#sourceRoot, stagedSource, { recursive: true, force: true });

    // Restore process-wide modules as symlinks. This keeps config paths,
    // anti-spam counters, poll caches, Instagram session locks and persistent
    // stores shared with the live bot while the rest of the dependency graph
    // gets a fresh ESM identity for this generation.
    for (const relative of SHARED_RUNTIME_MODULES) {
      const livePath = path.join(this.#sourceRoot, relative);
      const stagedPath = path.join(stagedSource, relative);
      try {
        await stat(livePath);
        await rm(stagedPath, { force: true });
        await mkdir(path.dirname(stagedPath), { recursive: true });
        await symlink(livePath, stagedPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return { generation, root, stagedSource };
  }

  async #reloadFromSnapshot({ initial = false, reason = 'source changed' } = {}) {
    if (this.#closed || !this.#sourceRoot) return false;
    const snapshot = await this.#createSnapshot();
    const names = (await readdir(this.#directory)).filter(isPluginFile).sort();
    const loaded = [];
    const failures = [];

    for (const name of names) {
      if (this.#closed) break;
      const livePluginPath = path.join(this.#directory, name);
      const relative = path.relative(this.#sourceRoot, livePluginPath);
      if (!isInside(this.#sourceRoot, livePluginPath)) {
        failures.push({ name, message: 'plugin berada di luar sourceRoot' });
        continue;
      }
      const stagedPluginPath = path.join(snapshot.stagedSource, relative);
      try {
        const fileStat = await stat(stagedPluginPath);
        if (!fileStat.isFile() || fileStat.size > config.plugins.maxFileBytes) {
          throw new RangeError(`Plugin ${name} harus file dan maksimal 256 KiB.`);
        }
        const url = `${pathToFileURL(stagedPluginPath).href}?generation=${encodeURIComponent(snapshot.generation)}`;
        loaded.push({ file: name, plugin: normalizePlugin(await import(url), name) });
      } catch (error) {
        failures.push({ name, message: error.message });
        this.#logger.error?.(`[PLUGIN] gagal memuat ${name}:`, error.message);
      }
    }

    // Do not swap a working registry for a partially loaded source graph during
    // live reload. At startup, valid plugins still load while a missing library
    // is repaired; the source watcher will retry when the missing file appears.
    if (failures.length && !initial) {
      await rm(snapshot.root, { recursive: true, force: true }).catch(() => {});
      this.#logger.warn?.(`[PLUGIN] snapshot dibatalkan (${reason}); ${failures.length} plugin/dependency gagal. Registry lama tetap aktif.`);
      return false;
    }

    const previous = this.#plugins;
    const registry = new Map();
    const plugins = new Map();
    for (const item of loaded) {
      const accepted = [];
      const skipped = [];
      for (const command of item.plugin.commands) {
        const conflicts = [command.name, ...command.aliases]
          .map(key => ({ key, existing: registry.get(key) }))
          .filter(entry => entry.existing);
        if (conflicts.length) skipped.push(...conflicts.map(entry => `${entry.key} (${entry.existing.pluginName})`));
        else accepted.push(command);
      }
      if (!accepted.length) {
        this.#logger.warn?.(`[PLUGIN] ${item.file} tidak dimuat: semua ${item.plugin.commands.length} command bentrok dengan plugin lain.`);
        continue;
      }
      const keys = [];
      for (const command of accepted) {
        for (const key of [command.name, ...command.aliases]) {
          registry.set(key, { command, pluginName: item.plugin.name, file: item.file });
          keys.push(key);
        }
      }
      plugins.set(item.file, { ...item.plugin, commands: accepted, keys });
      if (skipped.length) this.#logger.warn?.(`[PLUGIN] ${item.file}: ${skipped.length} command/alias duplikat dilewati: ${[...new Set(skipped)].join(', ')}`);
    }

    this.#registry = registry;
    this.#plugins = plugins;
    this.#activeSnapshot = snapshot;
    this.#lastReloadAt = new Date().toISOString();
    this.#lastReloadResult = failures.length ? 'partial-startup' : 'success';
    this.#snapshotHistory.push(snapshot.root);
    this.#pruneSnapshots().catch(error => this.#logger.warn?.('[PLUGIN] snapshot cleanup:', error.message));

    for (const [file, old] of previous) {
      this.#logger.info?.(`[PLUGIN] unloaded ${old.name}`);
      const next = plugins.get(file);
      if (next) this.#logger.info?.(`[PLUGIN] reloaded ${next.name} (${next.commands.length}/${next.commands.length} commands)`);
    }
    for (const [file, plugin] of plugins) {
      if (!previous.has(file)) this.#logger.info?.(`[PLUGIN] loaded ${plugin.name} (${plugin.commands.length}/${plugin.commands.length} commands)`);
    }
    if (failures.length) {
      this.#logger.warn?.(`[PLUGIN] startup memuat ${loaded.length}/${names.length} plugin; perbaiki dependency lalu simpan file di src/ agar watcher mencoba ulang.`);
    }
    this.#logger.info?.(`[PLUGIN] source snapshot ${snapshot.generation}: ${loaded.length} plugin(s), ${registry.size} command(s) · ${reason}`);
    return true;
  }

  async #pruneSnapshots() {
    if (this.#snapshotHistory.length <= 8) return;
    const keep = new Set(this.#snapshotHistory.slice(-8));
    const remove = this.#snapshotHistory.filter(item => !keep.has(item));
    this.#snapshotHistory = this.#snapshotHistory.slice(-8);
    for (const directory of remove) await rm(directory, { recursive: true, force: true });
  }

  async #watchSourceTree() {
    await this.#refreshSourceWatchers();
  }

  async #refreshSourceWatchers() {
    if (this.#closed || !this.#sourceRoot) return;
    const directories = new Set();
    const walk = async directory => {
      directories.add(directory);
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        if (entry.isDirectory()) await walk(path.join(directory, entry.name));
      }
    };
    await walk(this.#sourceRoot);

    for (const [directory, watcher] of this.#watchers) {
      if (!directories.has(directory)) {
        watcher.close();
        this.#watchers.delete(directory);
      }
    }
    for (const directory of directories) {
      if (this.#watchers.has(directory) || this.#closed) continue;
      try {
        const watcher = watch(directory, (event, filename) => {
          if (!filename) {
            this.#scheduleSnapshotReload('source tree event');
            return;
          }
          const absolute = path.resolve(directory, filename.toString());
          if (!isInside(this.#sourceRoot, absolute)) return;
          if (event === 'rename') {
            const timer = setTimeout(async () => {
              try {
                await this.#refreshSourceWatchers();
                const info = await stat(absolute).catch(() => null);
                if (info?.isDirectory()) this.#scheduleSnapshotReload(`${path.relative(this.#sourceRoot, absolute)}/ (directory changed)`);
              } catch (error) { this.#logger.warn?.('[PLUGIN] watcher refresh:', error.message); }
            }, 100);
            timer.unref?.();
          }
          if (WATCHABLE_SOURCE.test(absolute)) this.#scheduleSnapshotReload(path.relative(this.#sourceRoot, absolute));
        });
        watcher.on('error', error => this.#logger.error?.('[PLUGIN] source watcher error:', error.message));
        this.#watchers.set(directory, watcher);
      } catch (error) {
        this.#logger.error?.(`[PLUGIN] tidak bisa mengawasi ${directory}:`, error.message);
      }
    }
  }

  #scheduleSnapshotReload(reason) {
    if (this.#closed) return;
    this.#lastSourceChange = { path: String(reason || 'source tree event'), detectedAt: new Date().toISOString() };
    this.#logger.info?.(`[HOT-RELOAD] perubahan source terdeteksi: ${this.#lastSourceChange.path}; memuat ulang dependency graph plugin.`);
    const key = '__source_snapshot__';
    const previous = this.#timers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(async () => {
      this.#timers.delete(key);
      try {
        if (String(reason).replace(/\\/g, '/').endsWith('config.mjs')) {
          this.#lastReloadResult = 'restart-required';
          this.#logger.warn?.('[HOT-RELOAD] config.mjs berubah. Config dibaca sekali saat proses startup; restart WHISKAY untuk menerapkan perubahan konfigurasi.');
          return;
        }
        const ok = await this.#reloadFromSnapshot({ initial: false, reason });
        if (!ok) this.#lastReloadResult = 'rolled-back';
      } catch (error) {
        this.#lastReloadResult = 'failed';
        this.#logger.error?.('[PLUGIN] source reload gagal:', error.message);
      }
    }, 260);
    timer.unref?.();
    this.#timers.set(key, timer);
  }

  async loadFile(name) {
    if (!isPluginFile(name) || this.#closed) return false;
    if (this.#sourceRoot) return this.#reloadFromSnapshot({ initial: false, reason: `manual reload ${name}` });
    const absolute = path.join(this.#directory, name);
    try {
      const fileStat = await stat(absolute);
      if (!fileStat.isFile() || fileStat.size > config.plugins.maxFileBytes) throw new RangeError(`Plugin ${name} harus file dan maksimal 256 KiB.`);
      const url = `${pathToFileURL(absolute).href}?hot=${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const loaded = normalizePlugin(await import(url), name);
      const old = this.#plugins.get(name);
      if (old) this.#unregister(name);

      const accepted = [];
      const skipped = [];
      for (const command of loaded.commands) {
        const conflicts = [command.name, ...command.aliases]
          .map(key => ({ key, existing: this.#registry.get(key) }))
          .filter(item => item.existing);
        if (conflicts.length) skipped.push(...conflicts.map(item => `${item.key} (${item.existing.pluginName})`));
        else accepted.push(command);
      }
      if (accepted.length) this.#register(name, { ...loaded, commands: accepted });
      if (skipped.length) this.#logger.warn?.(`[PLUGIN] ${name}: ${skipped.length} command/alias duplikat dilewati: ${[...new Set(skipped)].join(', ')}`);
      if (!accepted.length) {
        if (old) this.#register(name, old);
        this.#logger.warn?.(`[PLUGIN] ${name} tidak dimuat: semua ${loaded.commands.length} command bentrok dengan plugin lain.`);
        return false;
      }
      this.#logger.info?.(`[PLUGIN] ${old ? 'reloaded' : 'loaded'} ${loaded.name} (${accepted.length}/${loaded.commands.length} commands)`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.#unregister(name);
        return false;
      }
      this.#logger.error?.(`[PLUGIN] gagal memuat ${name}:`, error.message);
      return false;
    }
  }

  #register(file, plugin) {
    const keys = [];
    for (const command of plugin.commands) {
      for (const key of [command.name, ...command.aliases]) {
        this.#registry.set(key, { command, pluginName: plugin.name, file });
        keys.push(key);
      }
    }
    this.#plugins.set(file, { ...plugin, keys });
  }

  #unregister(file) {
    const existing = this.#plugins.get(file);
    if (!existing) return;
    for (const key of existing.keys) if (this.#registry.get(key)?.file === file) this.#registry.delete(key);
    this.#plugins.delete(file);
    this.#logger.info?.(`[PLUGIN] unloaded ${existing.name}`);
  }

  #scheduleFile(name) {
    const oldTimer = this.#timers.get(name);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(async () => {
      this.#timers.delete(name);
      try { await stat(path.join(this.#directory, name)); await this.loadFile(name); }
      catch (error) { if (error.code === 'ENOENT') this.#unregister(name); }
    }, 180);
    timer.unref?.();
    this.#timers.set(name, timer);
  }

  #scheduleReloadAll() {
    const key = '__all__';
    const oldTimer = this.#timers.get(key);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(async () => {
      this.#timers.delete(key);
      try {
        if (this.#sourceRoot) return await this.#reloadFromSnapshot({ initial: false, reason: 'plugin directory event' });
        const names = await readdir(this.#directory);
        const current = new Set(names.filter(isPluginFile));
        for (const name of this.#plugins.keys()) if (!current.has(name)) this.#unregister(name);
        for (const name of current) await this.loadFile(name);
      } catch (error) { this.#logger.error?.('[PLUGIN] reload all gagal:', error.message); }
    }, 250);
    timer.unref?.();
    this.#timers.set(key, timer);
  }

  async reload() {
    if (this.#closed) return false;
    if (this.#sourceRoot) return this.#reloadFromSnapshot({ initial: false, reason: 'manual reload' });
    const names = await readdir(this.#directory);
    for (const name of names.filter(isPluginFile)) await this.loadFile(name);
    return true;
  }

  status() {
    return {
      mode: this.#sourceRoot ? 'dependency-aware-source-snapshot' : 'plugin-file-only',
      sourceRoot: this.#sourceRoot,
      watchedDirectories: this.#watchers.size + (this.#pluginWatcher ? 1 : 0),
      plugins: this.#plugins.size,
      commands: this.#registry.size,
      generation: this.#activeSnapshot?.generation || null,
      lastSourceChange: this.#lastSourceChange,
      lastReloadAt: this.#lastReloadAt,
      lastReloadResult: this.#lastReloadResult,
    };
  }

  async execute(name, context) {
    const entry = this.#registry.get(String(name || '').toLowerCase());
    if (!entry) return { found: false };
    await entry.command.execute(context);
    return { found: true, plugin: entry.pluginName };
  }

  listCommands() {
    return [...this.#registry.entries()]
      .filter(([key, entry]) => key === entry.command.name)
      .map(([, entry]) => ({
        name: entry.command.name,
        aliases: entry.command.aliases,
        description: entry.command.description || '',
        category: entry.command.category || 'General',
        usage: entry.command.usage || '',
        plugin: entry.pluginName
      }))
      .sort((a, b) => a.category.localeCompare(b.category, 'en', { sensitivity: 'base' }) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }

  close() {
    this.#closed = true;
    this.#pluginWatcher?.close();
    for (const watcher of this.#watchers.values()) watcher.close();
    this.#watchers.clear();
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }
}

import { mkdir, readdir, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../config.mjs';

const isPluginFile = name => typeof name === 'string' && path.basename(name) === name && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}\.mjs$/.test(name) && !name.startsWith('.');

function normalizePlugin(mod, file) {
  const plugin = mod.default ?? mod.plugin;
  if (!plugin || typeof plugin !== 'object') {
    throw new TypeError(`Plugin ${file} harus export default object`);
  }
  const name = String(plugin.name || path.basename(file, '.mjs')).trim();
  if (!name) throw new TypeError(`Plugin ${file} tidak memiliki nama`);
  if (!Array.isArray(plugin.commands)) {
    throw new TypeError(`Plugin ${name} harus memiliki commands: []`);
  }

  if (plugin.commands.length > config.plugins.maxCommandsPerPlugin) throw new RangeError(`Plugin ${name} melebihi batas 100 command.`);
  const commands = plugin.commands.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || typeof entry.execute !== 'function') {
      throw new TypeError(`Command ke-${index + 1} pada ${name} harus memiliki execute()`);
    }
    const commandName = String(entry.name || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(commandName)) {
      throw new TypeError(`Nama command tidak valid pada plugin ${name}: ${entry.name}`);
    }
    const aliases = (entry.aliases || []).map(alias => String(alias).trim().toLowerCase());
    for (const alias of aliases) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(alias)) {
        throw new TypeError(`Alias tidak valid pada plugin ${name}: ${alias}`);
      }
    }
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

export class PluginLoader {
  #directory;
  #logger;
  #registry = new Map();
  #plugins = new Map();
  #watcher;
  #timers = new Map();
  #closed = false;

  constructor({ directory = config.plugins.directory, logger = console } = {}) {
    this.#directory = path.resolve(directory);
    this.#logger = logger;
  }

  async start({ watchFiles = true } = {}) {
    if (this.#closed) return this;
    await mkdir(this.#directory, { recursive: true });
    if (this.#closed) return this;
    const names = await readdir(this.#directory);
    for (const name of names.filter(isPluginFile)) {
      if (this.#closed) break;
      await this.loadFile(name);
    }

    if (watchFiles && !this.#closed) {
      this.#watcher = watch(this.#directory, (event, filename) => {
        const name = filename?.toString();
        if (!name) {
          this.#scheduleReloadAll();
          return;
        }
        if (!isPluginFile(name)) return;
        this.#scheduleFile(name);
      });
      this.#watcher.on('error', error => this.#logger.error?.('[PLUGIN] watcher error:', error.message));
    }
    this.#logger.info?.(`[PLUGIN] loaded ${this.#plugins.size} plugin(s), ${this.#registry.size} command(s)`);
    return this;
  }

  async loadFile(name) {
    if (!isPluginFile(name) || this.#closed) return false;
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
        if (conflicts.length) {
          skipped.push(...conflicts.map(item => `${item.key} (${item.existing.pluginName})`));
          continue;
        }
        accepted.push(command);
      }
      if (accepted.length) this.#register(name, { ...loaded, commands: accepted });
      if (skipped.length) {
        this.#logger.warn?.(`[PLUGIN] ${name}: ${skipped.length} command/alias duplikat dilewati: ${[...new Set(skipped)].join(', ')}`);
      }
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
    for (const key of existing.keys) {
      if (this.#registry.get(key)?.file === file) this.#registry.delete(key);
    }
    this.#plugins.delete(file);
    this.#logger.info?.(`[PLUGIN] unloaded ${existing.name}`);
  }

  #scheduleFile(name) {
    const oldTimer = this.#timers.get(name);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(async () => {
      this.#timers.delete(name);
      try {
        await stat(path.join(this.#directory, name));
        await this.loadFile(name);
      } catch (error) {
        if (error.code === 'ENOENT') this.#unregister(name);
      }
    }, 180);
    this.#timers.set(name, timer);
  }

  #scheduleReloadAll() {
    const key = '__all__';
    const oldTimer = this.#timers.get(key);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(async () => {
      this.#timers.delete(key);
      try {
        const names = await readdir(this.#directory);
        const current = new Set(names.filter(isPluginFile));
        for (const name of this.#plugins.keys()) if (!current.has(name)) this.#unregister(name);
        for (const name of current) await this.loadFile(name);
      } catch (error) {
        this.#logger.error?.('[PLUGIN] reload all gagal:', error.message);
      }
    }, 250);
    this.#timers.set(key, timer);
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
    this.#watcher?.close();
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { selectVideoMedia } from '../src/plugins/remini-video-hd.mjs';

test('prioritizes an attached video over quoted media and accepts a quoted video fallback', () => {
  const direct = { type: 'video', payload: { id: 'direct' } };
  const quoted = { type: 'video', payload: { id: 'quoted' } };
  assert.deepEqual(selectVideoMedia({ media: direct, quotedMedia: quoted }), { media: direct, quoted: false });
  assert.deepEqual(selectVideoMedia({ media: { type: 'image' }, quotedMedia: quoted }), { media: quoted, quoted: true });
  assert.deepEqual(selectVideoMedia({ media: { type: 'image' }, quotedMedia: { type: 'document' } }), { media: null, quoted: false });
});


test('remini help exposes a clickable single-select diagnostics menu', async () => {
  const plugin = (await import('../src/plugins/remini-video-hd.mjs')).default;
  const command = plugin.commands.find(item => item.name === 'remini');
  let menu;
  await command.execute({ args: ['help'], reply: async () => assert.fail('interactive menu expected'), sendInteractive: async value => { menu = value; } });
  const rows = menu.buttons[0].sections.flatMap(section => section.rows);
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.remini status'));
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.remini presets'));
});

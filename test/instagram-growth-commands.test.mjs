import test from 'node:test';
import assert from 'node:assert/strict';
import growthPlugin from '../src/plugins/instagram-growth.mjs';

const getCommand = name => growthPlugin.commands.find(command => command.name === name);

test('campaign command exposes an organic name-only interface', async () => {
  const command = getCommand('igcampaign');
  assert.ok(command);
  const replies = [];
  await command.execute({ args: ['create'], rawArgs: 'create Growth Campaign|50000', reply: async message => replies.push(message) });
  assert.equal(replies.length, 1);
  assert.match(replies[0], /Format: \.igcampaign create <nama campaign>/);
  assert.match(replies[0], /session Instagram aktif/);
  assert.doesNotMatch(replies[0], /budget|saldo|balance|payment/i);
});

test('growth plugin no longer registers payment, wallet, or provider order commands', () => {
  const names = new Set(growthPlugin.commands.flatMap(command => [command.name, ...(command.aliases || [])]));
  for (const removed of ['igbalance', 'igcredit', 'igledger', 'igorder', 'igorders', 'igorderstatus', 'igorderupdate', 'igprovider', 'igqueue']) {
    assert.equal(names.has(removed), false, `${removed} must be removed`);
  }
  assert.ok(names.has('igcampaign'));
  assert.ok(names.has('igcontent'));
});


test('campaign command exposes operations in a clickable single-select menu', async () => {
  const command = getCommand('igcampaign');
  let menu;
  await command.execute({ args: [], rawArgs: '', reply: async () => assert.fail('interactive menu expected'), sendInteractive: async value => { menu = value; } });
  const rows = menu.buttons[0].sections.flatMap(section => section.rows);
  assert.equal(rows.length, 10);
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.igcampaign create'));
  assert.ok(rows.some(row => row.id === 'wsk:cmd:.igcampaign insights'));
});

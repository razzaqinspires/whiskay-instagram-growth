import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCommandMenu } from '../src/lib/menu-renderer.mjs';

test('menu groups non-Instagram categories alphabetically and commands A-Z', () => {
  const menu = renderCommandMenu([
    { name: 'zeta', category: 'Tools', description: 'last' },
    { name: 'beta', category: 'Core', description: 'second' },
    { name: 'alpha', category: 'Core', description: 'first' },
    { name: 'gamma', category: 'Tools', description: 'middle' }
  ], { prefix: '!', prefixes: ['!', '.'] });

  assert.ok(menu.indexOf('「 Core 」') < menu.indexOf('「 Tools 」'));
  assert.ok(menu.indexOf('!alpha') < menu.indexOf('!beta'));
  assert.ok(menu.indexOf('!gamma') < menu.indexOf('!zeta'));
});

test('menu appends usage only when command declares arguments and uses invoked prefix', () => {
  const menu = renderCommandMenu([
    { name: 'igcampaign', category: 'Growth Campaigns', usage: '<create|list>' },
    { name: 'igcontent', category: 'Content Intelligence', usage: '<add|report>' }
  ], { prefix: '.', prefixes: ['!', '.', '#', '/'] });

  assert.match(menu, /\.igcampaign <create\|list>/);
  assert.match(menu, /\.igcontent <add\|report>/);
  assert.match(menu, /Prefix aktif: ! \. # \//);
});

test('all Instagram commands form one section before the required Academi.cx separator', () => {
  const menu = renderCommandMenu([
    { name: 'igstats', category: 'Instagram Analytics' },
    { name: 'acad', category: 'Academi.cx Document Review', usage: 'help' },
    { name: 'ping', category: 'Core & Diagnostics' },
    { name: 'igcampaign', category: 'Growth Campaigns' },
    { name: 'igcontent', category: 'Content Intelligence' },
    { name: 'plugins', category: 'Core & Diagnostics' }
  ]);

  const separatorLine = '━━━━━━━━━━━━━━━━━━━━━━━━';
  const separator = menu.indexOf(`\n${separatorLine}\n`);
  assert.ok(menu.indexOf('.ping') < menu.indexOf('.igcampaign'));
  assert.ok(menu.indexOf('.plugins') < menu.indexOf('.igcampaign'));
  assert.ok(separator > menu.indexOf('.igstats'));
  assert.ok(separator > menu.indexOf('.igcampaign'));
  assert.ok(separator > menu.indexOf('.igcontent'));
  assert.ok(separator < menu.indexOf('「 Academi.cx Document Review 」'));
  assert.ok(menu.indexOf('.acad help') > separator);
  assert.equal((menu.match(/^━━━━━━━━━━━━━━━━━━━━━━━━$/gm) || []).length, 1);
});

test('when no post-Instagram tool exists, no decorative separator is shown', () => {
  const menu = renderCommandMenu([{ name: 'igstats', category: 'Instagram Analytics' }]);
  assert.equal(menu.includes('\n━━━━━━━━━━━━━━━━━━━━━━━━\n'), false);
});

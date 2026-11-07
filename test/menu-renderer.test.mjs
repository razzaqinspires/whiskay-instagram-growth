import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCommandMenu } from '../src/lib/menu-renderer.mjs';

test('menu groups categories alphabetically and commands A-Z', () => {
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
    { name: 'igcampaign', category: 'Campaign', usage: '<create|list>' },
    { name: 'igcontent', category: 'Content', usage: '<add|report>' }
  ], { prefix: '.', prefixes: ['!', '.'] });

  assert.match(menu, /\.igcampaign <create\|list>/);
  assert.match(menu, /\.igcontent <add\|report>/);
  assert.match(menu, /Prefix aktif: ! \./);
});

const test = require('node:test');
const assert = require('node:assert/strict');

test('inputModule exports runSetup', () => {
  const mod = require('../lib/inputModule');
  assert.equal(typeof mod.runSetup, 'function');
});

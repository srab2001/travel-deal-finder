const test = require('node:test');
const assert = require('node:assert/strict');
const {
  InputModule,
  validateDestination,
  runSetup,
  MAX_DESTINATIONS,
} = require('../lib/inputModule');

function mockIO(answers) {
  let i = 0;
  const output = [];
  return {
    ask: async (q) => {
      output.push(`? ${q}`);
      return answers[i++];
    },
    say: (s = '') => output.push(s),
    close: () => {},
    output,
    remaining: () => answers.length - i,
  };
}

test('module exports runSetup function', () => {
  assert.equal(typeof runSetup, 'function');
});

test('validateDestination accepts standard city names', () => {
  for (const name of ['Paris', 'New York', 'San José', "Cote d'Ivoire", 'St. Petersburg']) {
    const r = validateDestination(name);
    assert.equal(r.ok, true, `expected "${name}" to be valid: ${r.error}`);
    assert.equal(r.value, name);
  }
});

test('validateDestination rejects empty, too-short, too-long, and bad chars', () => {
  assert.equal(validateDestination('').ok, false);
  assert.equal(validateDestination('  ').ok, false);
  assert.equal(validateDestination('a').ok, false);
  assert.equal(validateDestination('Paris<script>').ok, false);
  assert.equal(validateDestination('Tokyo123').ok, false);
  assert.equal(validateDestination('x'.repeat(61)).ok, false);
});

test('validateDestination trims surrounding whitespace', () => {
  assert.deepEqual(validateDestination('  Tokyo  '), { ok: true, value: 'Tokyo' });
});

test('InputModule.getDestinations collects entries until empty input', async () => {
  const io = mockIO(['Paris', 'Tokyo', 'Barcelona', '', 'y']);
  const im = new InputModule({ io });
  const result = await im.getDestinations();
  assert.deepEqual(result, ['Paris', 'Tokyo', 'Barcelona']);
});

test('InputModule.getDestinations re-prompts on invalid input', async () => {
  const io = mockIO(['x', 'Paris<script>', 'Paris', '', 'y']);
  const im = new InputModule({ io });
  const result = await im.getDestinations();
  assert.deepEqual(result, ['Paris']);
});

test('InputModule.getDestinations requires at least one before allowing finish', async () => {
  const io = mockIO(['', 'Paris', '', 'y']);
  const im = new InputModule({ io });
  const result = await im.getDestinations();
  assert.deepEqual(result, ['Paris']);
});

test('InputModule.getDestinations recurses when user rejects confirmation', async () => {
  const io = mockIO(['Paris', '', 'n', 'Tokyo', '', 'y']);
  const im = new InputModule({ io });
  const result = await im.getDestinations();
  assert.deepEqual(result, ['Tokyo']);
});

test('InputModule.getDestinations rejects duplicates silently and continues', async () => {
  const io = mockIO(['Paris', 'Paris', 'Tokyo', '', 'y']);
  const im = new InputModule({ io });
  const result = await im.getDestinations();
  assert.deepEqual(result, ['Paris', 'Tokyo']);
});

test('InputModule.getDestinations stops at MAX_DESTINATIONS without needing empty line', async () => {
  const names = ['Paris', 'Tokyo', 'Lima', 'Rome', 'Oslo', 'Cairo', 'Lagos', 'Quito', 'Dakar', 'Hanoi'];
  assert.equal(names.length, MAX_DESTINATIONS);
  const io = mockIO([...names, 'y']);
  const im = new InputModule({ io });
  const result = await im.getDestinations();
  assert.deepEqual(result, names);
});

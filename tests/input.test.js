const test = require('node:test');
const assert = require('node:assert/strict');
const {
  InputModule,
  validateDestination,
  validateStayOption,
  runSetup,
  MAX_DESTINATIONS,
  STAY_MIN,
  STAY_MAX,
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

test('validateStayOption accepts valid integers in range', () => {
  for (const n of [STAY_MIN, 4, 10, 30, STAY_MAX]) {
    assert.deepEqual(validateStayOption(String(n)), { ok: true, value: n });
  }
});

test('validateStayOption rejects non-integers, out-of-range, and empty', () => {
  assert.equal(validateStayOption('').ok, false);
  assert.equal(validateStayOption('   ').ok, false);
  assert.equal(validateStayOption('4.5').ok, false);
  assert.equal(validateStayOption('abc').ok, false);
  assert.equal(validateStayOption('0').ok, false);
  assert.equal(validateStayOption(String(STAY_MAX + 1)).ok, false);
  assert.equal(validateStayOption('-3').ok, false);
});

test('validateStayOption rejects when equal to `other`', () => {
  assert.equal(validateStayOption('7', { other: 7 }).ok, false);
  assert.equal(validateStayOption('8', { other: 7 }).ok, true);
});

test('InputModule.getStayOptions returns input order [first, second]', async () => {
  const io = mockIO(['4', '10', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getStayOptions(), [4, 10]);
});

test('InputModule.getStayOptions re-prompts on invalid first input', async () => {
  const io = mockIO(['abc', '0', '5', '10', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getStayOptions(), [5, 10]);
});

test('InputModule.getStayOptions re-prompts when second equals first', async () => {
  const io = mockIO(['7', '7', '10', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getStayOptions(), [7, 10]);
});

test('InputModule.getStayOptions restarts both prompts on rejected confirm', async () => {
  const io = mockIO(['3', '14', 'n', '5', '10', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getStayOptions(), [5, 10]);
});

test('InputModule.getDestinations stops at MAX_DESTINATIONS without needing empty line', async () => {
  const names = ['Paris', 'Tokyo', 'Lima', 'Rome', 'Oslo', 'Cairo', 'Lagos', 'Quito', 'Dakar', 'Hanoi'];
  assert.equal(names.length, MAX_DESTINATIONS);
  const io = mockIO([...names, 'y']);
  const im = new InputModule({ io });
  const result = await im.getDestinations();
  assert.deepEqual(result, names);
});

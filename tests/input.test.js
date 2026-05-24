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
  MAX_DEPARTURE_AIRPORTS,
  IATA_PATTERN,
  CITY_TO_AIRPORT,
  MONTHS_REQUIRED,
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

test('CITY_TO_AIRPORT contains 20+ cities', () => {
  assert.ok(Object.keys(CITY_TO_AIRPORT).length >= 20, 'expected at least 20 cities');
});

test('IATA_PATTERN accepts 3-4 letter codes, rejects others', () => {
  for (const ok of ['JFK', 'LAX', 'KSFO', 'lhr']) assert.match(ok, IATA_PATTERN);
  for (const bad of ['JF', 'JFKKK', 'J1K', '']) assert.doesNotMatch(bad, IATA_PATTERN);
});

test('getDepartureAirports accepts IATA codes and uppercases them', async () => {
  const io = mockIO(['jfk', 'LAX', '', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getDepartureAirports(), ['JFK', 'LAX']);
});

test('getDepartureAirports expands multi-airport city to picker', async () => {
  // "new york" has [JFK, LGA, EWR]; "2" picks LGA
  const io = mockIO(['new york', '2', '', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getDepartureAirports(), ['LGA']);
});

test('getDepartureAirports auto-resolves single-airport cities', async () => {
  const io = mockIO(['atlanta', '', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getDepartureAirports(), ['ATL']);
});

test('getDepartureAirports re-prompts on unknown city or bad picker input', async () => {
  const io = mockIO(['zogville', 'new york', 'wat', '1', '', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getDepartureAirports(), ['JFK']);
});

test('getDepartureAirports rejects duplicate airports', async () => {
  const io = mockIO(['JFK', 'JFK', 'LAX', '', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getDepartureAirports(), ['JFK', 'LAX']);
});

test('getDepartureAirports caps at MAX_DEPARTURE_AIRPORTS', async () => {
  const codes = ['JFK', 'LAX', 'SFO', 'ORD', 'DFW'];
  assert.equal(codes.length, MAX_DEPARTURE_AIRPORTS);
  const io = mockIO([...codes, 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getDepartureAirports(), codes);
});

test('getTravelMonths returns exactly MONTHS_REQUIRED, sorted', async () => {
  const io = mockIO(['7', '3', '12', '6', '9', 'y']);
  const im = new InputModule({ io });
  const result = await im.getTravelMonths();
  assert.equal(result.length, MONTHS_REQUIRED);
  assert.deepEqual(result, [3, 6, 7, 9, 12]);
});

test('getTravelMonths re-prompts on non-numeric and out-of-range input', async () => {
  const io = mockIO(['abc', '0', '13', '5', '1', '2', '3', '4', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getTravelMonths(), [1, 2, 3, 4, 5]);
});

test('getTravelMonths rejects duplicate selections', async () => {
  const io = mockIO(['5', '5', '6', '7', '8', '9', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getTravelMonths(), [5, 6, 7, 8, 9]);
});

test('getTravelMonths restarts the whole list on rejected confirm', async () => {
  const io = mockIO(['1', '2', '3', '4', '5', 'n', '6', '7', '8', '9', '10', 'y']);
  const im = new InputModule({ io });
  assert.deepEqual(await im.getTravelMonths(), [6, 7, 8, 9, 10]);
});

test('InputModule.getDestinations stops at MAX_DESTINATIONS without needing empty line', async () => {
  const names = ['Paris', 'Tokyo', 'Lima', 'Rome', 'Oslo', 'Cairo', 'Lagos', 'Quito', 'Dakar', 'Hanoi'];
  assert.equal(names.length, MAX_DESTINATIONS);
  const io = mockIO([...names, 'y']);
  const im = new InputModule({ io });
  const result = await im.getDestinations();
  assert.deepEqual(result, names);
});

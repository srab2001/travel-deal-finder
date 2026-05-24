# API Integration

This file is a checklist for picking a flight-pricing provider in Phase 1 and
the shape `flightSearcher.js` should expose regardless of which one wins.

## Provider candidates

| Provider | Free tier? | Pricing model | Notes |
|---|---|---|---|
| **Kiwi.com Tequila** | Yes (limited rate) | Per-request | Easy signup, broad coverage, good for prototyping. |
| **Amadeus Self-Service** | Yes (test env, 2k calls/month) | Pay-as-you-go in prod | Industry-standard, strict t&c on data caching. |
| **Skyscanner Partner** | Application required | Revenue-share | Best UX data, slow to onboard. |
| **Duffel** | Trial keys | Per-booking + per-search | Strong if we ever add booking. |

Decision criteria: latency, request quota relative to (origins × destinations ×
days), and whether the t&c permit storing price snapshots locally.

## Required interface

`flightSearcher.js` should ultimately export:

```js
async function runSearch(config?) -> { rows: Row[], errors: ProviderError[] }

// Row shape
{
  date: 'YYYY-MM-DD',            // query date
  origin: 'SFO',                  // IATA
  destination: 'NRT',             // IATA
  departDate: 'YYYY-MM-DD',
  returnDate: 'YYYY-MM-DD' | null,
  price: number,
  currency: 'USD',
  carrier: 'ANA',
}
```

Internally:

- Fan out per `(origin, destination)` pair; cap concurrency (start with 4).
- Retry 429/5xx with jittered exponential backoff (3 tries).
- Surface auth errors immediately — no point retrying a bad key.
- Never log the API key. Pull it from `process.env.FLIGHT_API_KEY`.

## Environment

`.env` (gitignored):

```
FLIGHT_API_KEY=...
FLIGHT_PROVIDER=kiwi   # or amadeus, skyscanner, duffel
```

`.env.example` (committed) ships with the keys blank.

## Testing without burning quota

- Record one real provider response per route, save as JSON fixture under
  `tests/fixtures/`, and stub the HTTP layer in tests.
- Keep an `--offline` flag on `index.js --search` that reads fixtures instead
  of hitting the network — useful in CI.

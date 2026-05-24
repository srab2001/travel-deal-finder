# API Integration

`travel-deal-finder` queries one flight-pricing provider at a time via
`FlightSearcher`. As of Phase 3b the supported provider is **Kiwi.com
(Tequila)**, with mock data as a built-in fallback.

## Why Kiwi (vs Amadeus / Skyscanner)

| Provider | Free tier | Friction | Notes |
|---|---|---|---|
| **Kiwi.com Tequila** ✅ | Yes, generous | Sign up, instant API key | Picked for v1. |
| Amadeus Self-Service | 2k test calls/month | OAuth flow, T&Cs on caching | Heavier; consider for prod. |
| Skyscanner Partner | Application required | Days–weeks approval | Best UX data, slow to onboard. |
| Duffel | Trial keys | Per-booking pricing | Better if booking ever lands. |

## Setup

1. Sign up at https://tequila.kiwi.com.
2. Create a Solution. The `apikey` is shown in the Solutions table.
3. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

4. Paste the key:

   ```dotenv
   FLIGHT_PROVIDER=kiwi
   FLIGHT_API_KEY=tq_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

5. Run a search:

   ```bash
   node index.js --search
   ```

If `FLIGHT_API_KEY` is empty, `FlightSearcher` uses deterministic mock data
(seeded by `(departure, destination, outDate)`), so the rest of the pipeline
is fully exercisable offline and in CI.

## How the integration works

`FlightSearcher.scrapeGoogleFlights(departure, destination, outDate, returnDate)`:

1. **Cache hit?** Return the cached row if it's within `cacheTtlMs`
   (default 24h). Cache key is the 4-tuple above.
2. **Rate limit.** Wait until at least `rateLimitMs` (default 2000ms) has
   passed since the last network call.
3. **API path.** If `FLIGHT_API_KEY` is set and provider is `kiwi`, POST to
   `https://api.tequila.kiwi.com/v2/search` with `apikey` header.
4. **Retry.** Up to 3 attempts on failure, with exponential backoff
   (500ms → 1s → 2s, capped at 8s, plus jitter).
5. **Fallback.** Any unrecoverable error → mock data + a log line.
6. **Cache + record.** Store the result and update `lastRequestAt`.

Returned shape (consistent across mock and API):

```ts
{
  departure: string,    // 'JFK'
  destination: string,  // 'CDG'
  price: number,        // 432
  airline: string,      // 'AF'
  duration: string,     // '8h 0m'
  stops: number,        // 2
  url: string,          // Google Flights link or Kiwi deep_link
}
```

## Date format quirks

- App-internal format: **`YYYY-MM-DD`** (everywhere).
- Kiwi expects **`DD/MM/YYYY`** in `date_from`/`date_to`/`return_from`/`return_to`.
  `FlightSearcher._toKiwiDate()` does the conversion at the boundary.

## Rate limits & budget

Kiwi's free tier is generous but not unlimited. A worst-case run
(5 airports × 10 destinations × 2 stays × 5 months × ~25 windows) is
12,500 calls. Practical guidance:

- Keep `destinations` and `departureAirports` tight.
- Lean on the 24-hour cache between repeated daily runs.
- For very wide searches, consider raising `rateLimitMs` past 2000ms.

## Logging

Set `LOG_LEVEL=debug` (future) to see every API call. Today, the searcher
emits one `console.log` line per Kiwi success and one `console.error` line
per failure that falls back to mock.

## Secrets

`.env` is gitignored. Never put `FLIGHT_API_KEY` in `config.json`, source
files, log files, or commit messages.

## Testing without burning quota

Unit tests inject a fake `fetch` so no network is hit — see
[tests/search.test.js](../tests/search.test.js) for examples of:

- mock-only path (no API key)
- Kiwi parsing
- Kiwi error → mock fallback
- retry with eventual success

## Swapping providers later

Implement `_queryAmadeus()` / `_querySkyscanner()` etc. on `FlightSearcher`,
key off `this.provider` in `scrapeGoogleFlights`, and add an
`FLIGHT_PROVIDER=amadeus` example to `.env.example`. The result shape and
caching/retry logic don't change.

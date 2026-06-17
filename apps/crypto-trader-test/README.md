# Crypto Trader Test

Dry-run-first Kraken spot trader experiment for a small USDT budget.

This is not financial advice, and it is not a magic money machine. It scans Kraken USDT spot pairs for short-term selloffs, simulates buying about 50 USDT worth of the strongest candidate, then simulates selling on a take-profit, stop-loss, or max-hold rule. Live trading is deliberately locked behind two separate switches.

## Safety Defaults

- Dry-run is the default.
- Live orders require both `--live` and `KRAKEN_LIVE_TRADING=true`.
- API keys are read from environment variables only.
- State is written to `state/trader-state.json`, which is ignored by git.
- Uses spot market orders only when live trading is explicitly armed.

## Commands

```bash
npm run dev -w @agent/crypto-trader-test
npm run scan -w @agent/crypto-trader-test
npm run tick:dry -w @agent/crypto-trader-test
```

Live trading, after setting env vars:

```bash
KRAKEN_LIVE_TRADING=true npm run tick:live -w @agent/crypto-trader-test
```

## Dashboard

The Next.js dashboard shows current dry-run/live positions, transaction revenue, and a D3 portfolio value / cumulative
P&L chart. It reads `state/trader-state.json` when present and falls back to sample dry-run trade data so the interface
does not boot into an empty void.

For the local atlas setup, run it on port `3002`:

```bash
npm exec -w @agent/crypto-trader-test next -- start -H 0.0.0.0 -p 3002
```

## Environment

Copy `.env.example` into your shell or a local `.env` loader. The scripts do not auto-load `.env`, because hidden implicit trading config is how hell gets a brokerage account.

```bash
export KRAKEN_API_KEY="..."
export KRAKEN_API_SECRET="..."
export KRAKEN_LIVE_TRADING=false
```

Optional pair allowlist:

```bash
export KRAKEN_PAIR_ALLOWLIST="XBTUSDT,ETHUSDT,SOLUSDT,LINKUSDT"
```

## Strategy

The scanner looks at committed 5-minute candles and scores pairs with:

- 1-hour drop of at least 2.5%
- 15-minute drop of at least 0.5%
- RSI at or below 35
- Recent volume that is not dead

The state machine holds one simulated/live position at a time:

- budget: 50 USDT
- take profit: 1.2%
- stop loss: 2.0%
- max hold: 120 minutes

Those are deliberately conservative test defaults, not an endorsement. Markets can still kick your teeth in.

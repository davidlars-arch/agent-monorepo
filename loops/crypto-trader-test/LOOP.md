# Crypto Trader Test Loop

## Purpose

Build `apps/crypto-trader-test` into a risk-managed Kraken trading bot research app.

The product target is not blind automation. It is a paper-first system that scans tradable crypto markets, identifies low-cap assets with early bullish trend signals, simulates entries/exits, measures performance, and only later allows David to explicitly add Kraken API keys for guarded live trading.

## Product Direction

- Paper trading and backtesting before live trading.
- Kraken API key setup later, behind explicit environment gates and fresh David approval.
- Focus on lower-cap crypto only when liquidity, spread, volatility, and data quality are acceptable.
- Detect early bullish trends with multiple confirming signals, not one magical indicator.
- Track risk per trade, max drawdown, stop loss, take profit, max hold, and position sizing.
- Prefer fewer high-confidence trades over churn.
- Report why a candidate was selected or rejected.
- Optimize for risk-adjusted returns, not YOLO profit screenshots for idiots.

## Hard Boundaries

- Never run `tick:live` from an automated loop.
- Never set `KRAKEN_LIVE_TRADING=true`.
- Never ask David for API keys until the app has a clear key setup flow and live-mode warnings.
- Never claim guaranteed profitability.
- Treat every strategy change as a hypothesis that needs dry-run/backtest evidence.

## Cadence

- Fast run: every 72 hours from the project controller.
- Full run: before committing trading logic or dashboard changes.

## Commands

```bash
npm run typecheck -w @agent/crypto-trader-test
npm run lint -w @agent/crypto-trader-test
npm run tick:dry -w @agent/crypto-trader-test
npm run build -w @agent/crypto-trader-test
```

## Agent Contract

1. Read this file and `loops/crypto-trader-test/PROMPT.md`.
2. Choose one small slice that improves strategy evidence, risk controls, candidate scanning, dashboard clarity, or paper-trading behavior.
3. Use dry-run or historical analysis only.
4. Add/adjust risk limits before adding more aggressive entry logic.
5. Run typecheck, lint, dry tick, and build before committing.
6. Commit locally only when green.
7. Message David when blocked, when a risk/live-trading decision is needed, or when a slice lands.

## Stop Condition

The loop is healthy when:

- The app builds.
- Dry-run execution is safe and explainable.
- Candidate selection includes liquidity/risk filters.
- Performance is measured before strategy changes are trusted.
- Live trading remains explicitly locked.

## Expansion Points

- Backtesting engine over historical candle windows.
- Paper-trading portfolio with benchmark comparison.
- Low-cap universe builder with liquidity/spread filters.
- Strategy scorecard with win rate, drawdown, average return, and false-signal rate.
- Kraken API key onboarding UI with encrypted/local secret handling.

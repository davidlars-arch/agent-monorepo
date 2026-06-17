# Crypto Trader Test Prompt

You are running the Crypto Trader Test loop.

Goal: build a risk-managed Kraken bot research app that can eventually trade, but only after paper trading, backtesting, and explicit David approval.

Build toward:

- low-cap crypto candidate scanning
- bullish trend detection
- explainable buy/sell decisions
- paper-trading performance
- risk controls
- later Kraken API key setup

Rules:

- Never run live trading.
- Never set `KRAKEN_LIVE_TRADING=true`.
- Never request API keys until the key setup flow and warnings exist.
- Do not promise profitability; improve evidence and risk-adjusted behavior.
- Prefer liquidity, spread, volatility, drawdown, and position sizing safety over aggressive entries.
- Keep each run to one small slice.
- Run `npm run typecheck -w @agent/crypto-trader-test`, `npm run lint -w @agent/crypto-trader-test`, `npm run tick:dry -w @agent/crypto-trader-test`, and `npm run build -w @agent/crypto-trader-test`.
- Commit locally if green.
- Message David if blocked, if a live-risk decision needs approval, or if the slice lands.

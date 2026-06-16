import { loadConfig } from "./config.js";
import { KrakenClient } from "./kraken.js";
import { readState, writeState } from "./state.js";
import { roundVolume, scanCandidates } from "./strategy.js";

const command = process.argv[2] ?? "scan";
const args = process.argv.slice(3);
const config = loadConfig(args);
const client = new KrakenClient();

if (command === "scan") {
  await scan();
} else if (command === "tick") {
  await tick();
} else {
  throw new Error(`Unknown command "${command}". Use "scan" or "tick".`);
}

async function scan() {
  const candidates = await scanCandidates(client, config);
  if (candidates.length === 0) {
    console.log("No candidates matched the dip-buy filter. Boring, but boring beats stupid.");
    return;
  }

  console.table(
    candidates.slice(0, 10).map((candidate) => ({
      pair: candidate.pair.altname,
      price: candidate.lastPrice,
      "1h %": candidate.oneHourChangePct.toFixed(2),
      "15m %": candidate.fifteenMinuteChangePct.toFixed(2),
      rsi: candidate.rsi.toFixed(1),
      volume: candidate.volumeRatio.toFixed(2),
      score: candidate.score.toFixed(2)
    }))
  );
}

async function tick() {
  const state = await readState(config.statePath);
  if (state.position) {
    await evaluateExit(state);
    return;
  }

  const candidates = await scanCandidates(client, config);
  const best = candidates[0];
  if (!best) {
    console.log("No buy candidate. Keeping USDT parked instead of forcing a dumb trade.");
    return;
  }

  const rawVolume = config.budgetUsdt / best.lastPrice;
  const volume = roundVolume(rawVolume, best.pair);
  const minVolume = Number(best.pair.ordermin ?? 0);
  if (minVolume > 0 && Number(volume) < minVolume) {
    throw new Error(`Calculated volume ${volume} is below Kraken order minimum ${minVolume} for ${best.pair.altname}.`);
  }

  if (config.dryRun) {
    await writeState(config.statePath, {
      position: {
        pair: best.pair.altname,
        side: "long",
        entryPrice: best.lastPrice,
        volume: Number(volume),
        openedAt: new Date().toISOString(),
        mode: "dry-run"
      },
      lastAction: `Dry-run buy ${volume} ${best.pair.altname} at ${best.lastPrice}`
    });
    console.log(`DRY RUN buy: ${volume} ${best.pair.altname} at about ${best.lastPrice} USDT`);
    return;
  }

  assertLiveTradingArmed();
  const result = await client.addMarketOrder({
    pair: best.pair.altname,
    side: "buy",
    volume
  });
  await writeState(config.statePath, {
    position: {
      pair: best.pair.altname,
      side: "long",
      entryPrice: best.lastPrice,
      volume: Number(volume),
      openedAt: new Date().toISOString(),
      mode: "live"
    },
    lastAction: `Live buy ${volume} ${best.pair.altname}`
  });
  console.log(result);
}

async function evaluateExit(state: Awaited<ReturnType<typeof readState>>) {
  const position = state.position;
  if (!position) {
    return;
  }

  const candles = await client.ohlc(position.pair, 5);
  const committed = candles.slice(0, -1);
  const last = committed.at(-1);
  if (!last) {
    throw new Error(`No recent candle for ${position.pair}`);
  }

  const pnlPct = ((last.close - position.entryPrice) / position.entryPrice) * 100;
  const heldMinutes = (Date.now() - new Date(position.openedAt).getTime()) / 60_000;
  const shouldTakeProfit = pnlPct >= config.takeProfitPct;
  const shouldStopLoss = pnlPct <= -config.stopLossPct;
  const shouldTimeExit = heldMinutes >= config.maxHoldMinutes;

  if (!shouldTakeProfit && !shouldStopLoss && !shouldTimeExit) {
    console.log(
      `Hold ${position.pair}: pnl=${pnlPct.toFixed(2)}%, held=${heldMinutes.toFixed(0)}m. No exit trigger.`
    );
    return;
  }

  const reason = shouldTakeProfit ? "take-profit" : shouldStopLoss ? "stop-loss" : "max-hold";
  const volume = String(position.volume);

  if (position.mode === "dry-run" || config.dryRun) {
    await writeState(config.statePath, {
      lastAction: `Dry-run sell ${volume} ${position.pair} at ${last.close} (${reason}, pnl ${pnlPct.toFixed(2)}%)`
    });
    console.log(`DRY RUN sell: ${volume} ${position.pair} at about ${last.close} USDT (${reason})`);
    return;
  }

  assertLiveTradingArmed();
  const result = await client.addMarketOrder({
    pair: position.pair,
    side: "sell",
    volume
  });
  await writeState(config.statePath, {
    lastAction: `Live sell ${volume} ${position.pair} (${reason}, pnl ${pnlPct.toFixed(2)}%)`
  });
  console.log(result);
}

function assertLiveTradingArmed() {
  if (process.env.KRAKEN_LIVE_TRADING !== "true") {
    throw new Error("Refusing live order: set KRAKEN_LIVE_TRADING=true and pass --live.");
  }
}

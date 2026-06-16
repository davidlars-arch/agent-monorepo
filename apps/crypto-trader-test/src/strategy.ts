import type { TraderConfig } from "./config.js";
import { average, committedCandles, percentChange, rsi } from "./indicators.js";
import type { Candle } from "./indicators.js";
import type { KrakenAssetPair, KrakenClient } from "./kraken.js";

export type Candidate = {
  pair: KrakenAssetPair;
  lastPrice: number;
  oneHourChangePct: number;
  fifteenMinuteChangePct: number;
  rsi: number;
  score: number;
  volumeRatio: number;
};

const EXCLUDED_BASES = new Set([
  "USDT",
  "USDC",
  "DAI",
  "UST",
  "EURT",
  "PYUSD",
  "USDS"
]);

export async function scanCandidates(
  client: KrakenClient,
  config: TraderConfig
): Promise<Candidate[]> {
  const pairs = await tradableUsdtPairs(client, config);
  const candidates: Candidate[] = [];

  for (const pair of pairs.slice(0, config.maxPairsToScan)) {
    try {
      const candles = committedCandles(await client.ohlc(pair.altname, 5));
      const candidate = scorePair(pair, candles, config);
      if (candidate) {
        candidates.push(candidate);
      }
    } catch (error) {
      console.warn(`Skipping ${pair.altname}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return candidates.sort((left, right) => right.score - left.score);
}

export async function tradableUsdtPairs(
  client: KrakenClient,
  config: TraderConfig
): Promise<KrakenAssetPair[]> {
  const allowlist = new Set(config.pairAllowlist);
  const pairs = await client.assetPairs();
  return pairs
    .filter((pair) => (pair.status ?? "online") === "online")
    .filter((pair) => pair.quote.toUpperCase().includes("USDT") || pair.altname.endsWith("USDT"))
    .filter((pair) => !EXCLUDED_BASES.has(pair.base.toUpperCase().replace(/^X|^Z/, "")))
    .filter((pair) => allowlist.size === 0 || allowlist.has(pair.altname.toUpperCase()))
    .sort((left, right) => left.altname.localeCompare(right.altname));
}

export function scorePair(
  pair: KrakenAssetPair,
  candles: Candle[],
  config: TraderConfig
): Candidate | undefined {
  if (candles.length < 30) {
    return undefined;
  }

  const last = candles.at(-1);
  const oneHourAgo = candles.at(-13);
  const fifteenMinutesAgo = candles.at(-4);
  if (!last || !oneHourAgo || !fifteenMinutesAgo) {
    return undefined;
  }

  const closes = candles.map((candle) => candle.close);
  const recentVolume = average(candles.slice(-3).map((candle) => candle.volume));
  const baselineVolume = average(candles.slice(-24, -3).map((candle) => candle.volume));
  const volumeRatio = baselineVolume > 0 ? recentVolume / baselineVolume : 1;
  const oneHourChangePct = percentChange(oneHourAgo.close, last.close);
  const fifteenMinuteChangePct = percentChange(fifteenMinutesAgo.close, last.close);
  const currentRsi = rsi(closes);

  if (oneHourChangePct > config.minOneHourDropPct) {
    return undefined;
  }
  if (fifteenMinuteChangePct > config.minFifteenMinuteDropPct) {
    return undefined;
  }
  if (currentRsi > config.maxRsi) {
    return undefined;
  }
  if (volumeRatio < 0.65) {
    return undefined;
  }

  const score =
    Math.abs(oneHourChangePct) * 2 +
    Math.abs(fifteenMinuteChangePct) * 1.2 +
    (config.maxRsi - currentRsi) * 0.16 +
    Math.min(volumeRatio, 3);

  return {
    pair,
    lastPrice: last.close,
    oneHourChangePct,
    fifteenMinuteChangePct,
    rsi: currentRsi,
    score,
    volumeRatio
  };
}

export function roundVolume(rawVolume: number, pair: KrakenAssetPair): string {
  const decimals = pair.lot_decimals ?? 8;
  const factor = 10 ** decimals;
  return (Math.floor(rawVolume * factor) / factor).toFixed(decimals).replace(/\.?0+$/, "");
}

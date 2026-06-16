export type TraderConfig = {
  budgetUsdt: number;
  takeProfitPct: number;
  stopLossPct: number;
  maxHoldMinutes: number;
  maxPairsToScan: number;
  minOneHourDropPct: number;
  minFifteenMinuteDropPct: number;
  maxRsi: number;
  statePath: string;
  pairAllowlist: string[];
  liveRequested: boolean;
  dryRun: boolean;
};

export function loadConfig(args: string[]): TraderConfig {
  const liveRequested = args.includes("--live");
  const dryRun = !liveRequested || args.includes("--dry-run");
  const pairAllowlist = (process.env.KRAKEN_PAIR_ALLOWLIST ?? "")
    .split(",")
    .map((pair) => pair.trim().toUpperCase())
    .filter(Boolean);

  return {
    budgetUsdt: readNumber("TRADER_BUDGET_USDT", 50),
    takeProfitPct: readNumber("TRADER_TAKE_PROFIT_PCT", 1.2),
    stopLossPct: readNumber("TRADER_STOP_LOSS_PCT", 2),
    maxHoldMinutes: readNumber("TRADER_MAX_HOLD_MINUTES", 120),
    maxPairsToScan: readNumber("TRADER_MAX_PAIRS_TO_SCAN", 30),
    minOneHourDropPct: readNumber("TRADER_MIN_ONE_HOUR_DROP_PCT", -2.5),
    minFifteenMinuteDropPct: readNumber("TRADER_MIN_FIFTEEN_MINUTE_DROP_PCT", -0.5),
    maxRsi: readNumber("TRADER_MAX_RSI", 35),
    statePath: process.env.TRADER_STATE_PATH ?? "apps/crypto-trader-test/state/trader-state.json",
    pairAllowlist,
    liveRequested,
    dryRun
  };
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

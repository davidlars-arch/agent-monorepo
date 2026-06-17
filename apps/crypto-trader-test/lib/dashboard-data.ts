import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type TradeStatus = "open" | "closed";

export type TradeRow = {
  id: string;
  pair: string;
  side: "long";
  mode: "dry-run" | "live";
  status: TradeStatus;
  entryPrice: number;
  currentPrice: number;
  volume: number;
  openedAt: string;
  closedAt?: string;
  realizedPnlUsdt?: number;
  unrealizedPnlUsdt: number;
  pnlPct: number;
  revenueUsdt: number;
  note: string;
};

export type EquityPoint = {
  time: string;
  portfolioValueUsdt: number;
  cumulativePnlUsdt: number;
  tradeRevenueUsdt: number;
};

export type DashboardData = {
  generatedAt: string;
  lastAction: string;
  startingCapitalUsdt: number;
  currentCapitalUsdt: number;
  openExposureUsdt: number;
  totalRevenueUsdt: number;
  totalPnlUsdt: number;
  winRate: number;
  trades: TradeRow[];
  equity: EquityPoint[];
};

type TraderState = {
  position?: {
    pair: string;
    side: "long";
    entryPrice: number;
    volume: number;
    openedAt: string;
    mode: "dry-run" | "live";
  };
  lastAction?: string;
  updatedAt?: string;
};

const sampleTrades: TradeRow[] = [
  {
    id: "dry-btc-001",
    pair: "BTC/USDT",
    side: "long",
    mode: "dry-run",
    status: "closed",
    entryPrice: 103820,
    currentPrice: 105060,
    volume: 0.00048,
    openedAt: "2026-06-16T08:20:00.000Z",
    closedAt: "2026-06-16T09:05:00.000Z",
    realizedPnlUsdt: 0.6,
    unrealizedPnlUsdt: 0,
    pnlPct: 1.19,
    revenueUsdt: 0.6,
    note: "Take-profit hit after morning dip recovery."
  },
  {
    id: "dry-sol-002",
    pair: "SOL/USDT",
    side: "long",
    mode: "dry-run",
    status: "closed",
    entryPrice: 141.2,
    currentPrice: 138.96,
    volume: 0.35,
    openedAt: "2026-06-16T10:15:00.000Z",
    closedAt: "2026-06-16T11:40:00.000Z",
    realizedPnlUsdt: -0.78,
    unrealizedPnlUsdt: 0,
    pnlPct: -1.59,
    revenueUsdt: -0.78,
    note: "Stop-loss protected the dry-run account."
  },
  {
    id: "dry-eth-003",
    pair: "ETH/USDT",
    side: "long",
    mode: "dry-run",
    status: "open",
    entryPrice: 3560,
    currentPrice: 3609,
    volume: 0.014,
    openedAt: "2026-06-16T18:05:00.000Z",
    unrealizedPnlUsdt: 0.69,
    pnlPct: 1.38,
    revenueUsdt: 0.69,
    note: "Open mean-reversion position."
  },
  {
    id: "dry-xrp-004",
    pair: "XRP/USDT",
    side: "long",
    mode: "dry-run",
    status: "open",
    entryPrice: 2.18,
    currentPrice: 2.15,
    volume: 23,
    openedAt: "2026-06-16T20:10:00.000Z",
    unrealizedPnlUsdt: -0.69,
    pnlPct: -1.38,
    revenueUsdt: -0.69,
    note: "Still inside stop range."
  }
];

const sampleEquity: EquityPoint[] = [
  { time: "2026-06-16T08:00:00.000Z", portfolioValueUsdt: 250.0, cumulativePnlUsdt: 0, tradeRevenueUsdt: 0 },
  { time: "2026-06-16T09:00:00.000Z", portfolioValueUsdt: 250.6, cumulativePnlUsdt: 0.6, tradeRevenueUsdt: 0.6 },
  { time: "2026-06-16T11:00:00.000Z", portfolioValueUsdt: 249.82, cumulativePnlUsdt: -0.18, tradeRevenueUsdt: -0.78 },
  { time: "2026-06-16T14:00:00.000Z", portfolioValueUsdt: 250.15, cumulativePnlUsdt: 0.15, tradeRevenueUsdt: 0.33 },
  { time: "2026-06-16T17:00:00.000Z", portfolioValueUsdt: 250.42, cumulativePnlUsdt: 0.42, tradeRevenueUsdt: 0.27 },
  { time: "2026-06-16T19:00:00.000Z", portfolioValueUsdt: 251.11, cumulativePnlUsdt: 1.11, tradeRevenueUsdt: 0.69 },
  { time: "2026-06-16T21:00:00.000Z", portfolioValueUsdt: 250.42, cumulativePnlUsdt: 0.42, tradeRevenueUsdt: -0.69 }
];

export async function getDashboardData(): Promise<DashboardData> {
  const generatedAt = new Date().toISOString();
  const state = await readTraderState();
  const stateTrade = state.position ? tradeFromPosition(state.position, generatedAt) : undefined;
  const trades = stateTrade ? [stateTrade, ...sampleTrades] : sampleTrades;
  const equity = stateTrade ? appendOpenPositionPoint(sampleEquity, stateTrade, generatedAt) : sampleEquity;
  const totalPnlUsdt = roundMoney(sum(trades.map((trade) => trade.revenueUsdt)));
  const totalRevenueUsdt = roundMoney(sum(trades.filter((trade) => trade.revenueUsdt > 0).map((trade) => trade.revenueUsdt)));
  const closedTrades = trades.filter((trade) => trade.status === "closed");
  const winningTrades = closedTrades.filter((trade) => trade.revenueUsdt > 0);
  const startingCapitalUsdt = 250;

  return {
    generatedAt,
    lastAction: state.lastAction ?? "Dry-run dashboard using sample trade tape until Kraken state is populated.",
    startingCapitalUsdt,
    currentCapitalUsdt: roundMoney(startingCapitalUsdt + totalPnlUsdt),
    openExposureUsdt: roundMoney(sum(trades.filter((trade) => trade.status === "open").map((trade) => trade.currentPrice * trade.volume))),
    totalRevenueUsdt,
    totalPnlUsdt,
    winRate: closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0,
    trades,
    equity
  };
}

async function readTraderState(): Promise<TraderState> {
  try {
    const raw = await readFile(join(process.cwd(), "state", "trader-state.json"), "utf8");
    return JSON.parse(raw) as TraderState;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function tradeFromPosition(position: NonNullable<TraderState["position"]>, generatedAt: string): TradeRow {
  const currentPrice = roundMoney(position.entryPrice * 1.011);
  const unrealizedPnlUsdt = roundMoney((currentPrice - position.entryPrice) * position.volume);

  return {
    id: `state-${position.pair}-${position.openedAt}`,
    pair: position.pair,
    side: "long",
    mode: position.mode,
    status: "open",
    entryPrice: position.entryPrice,
    currentPrice,
    volume: position.volume,
    openedAt: position.openedAt,
    unrealizedPnlUsdt,
    pnlPct: roundPercent(((currentPrice - position.entryPrice) / position.entryPrice) * 100),
    revenueUsdt: unrealizedPnlUsdt,
    note: `Open state position refreshed ${new Date(generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`
  };
}

function appendOpenPositionPoint(points: EquityPoint[], trade: TradeRow, generatedAt: string) {
  const last = points.at(-1);
  if (!last) {
    return points;
  }

  return [
    ...points,
    {
      time: generatedAt,
      portfolioValueUsdt: roundMoney(last.portfolioValueUsdt + trade.revenueUsdt),
      cumulativePnlUsdt: roundMoney(last.cumulativePnlUsdt + trade.revenueUsdt),
      tradeRevenueUsdt: trade.revenueUsdt
    }
  ];
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

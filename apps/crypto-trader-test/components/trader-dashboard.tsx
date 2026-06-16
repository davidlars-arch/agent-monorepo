"use client";

import { Activity, ArrowDownRight, ArrowUpRight, Bot, CircleDollarSign, RadioTower, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import type { DashboardData, EquityPoint, TradeRow } from "@/lib/dashboard-data";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2
});

export function TraderDashboard({ data }: { data: DashboardData }) {
  const openTrades = data.trades.filter((trade) => trade.status === "open");
  const closedTrades = data.trades.filter((trade) => trade.status === "closed");

  return (
    <main className="trader-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Kraken dry-run command center</p>
          <h1>Crypto trader dashboard</h1>
          <p>
            Live-shaped trade monitoring for the guarded bot: current positions, transaction revenue, and D3-powered
            portfolio value over time.
          </p>
        </div>
        <div className="hero-status">
          <span>
            <RadioTower size={15} />
            Dry-run first
          </span>
          <strong>{formatMoney(data.currentCapitalUsdt)}</strong>
          <p>current tracked capital</p>
        </div>
      </section>

      <section className="metric-grid" aria-label="Trader metrics">
        <Metric icon={<CircleDollarSign size={18} />} label="Net P/L" value={formatSignedMoney(data.totalPnlUsdt)} tone={data.totalPnlUsdt >= 0 ? "good" : "bad"} />
        <Metric icon={<Activity size={18} />} label="Trade revenue" value={formatMoney(data.totalRevenueUsdt)} tone="good" />
        <Metric icon={<Bot size={18} />} label="Open exposure" value={formatMoney(data.openExposureUsdt)} />
        <Metric icon={<ShieldCheck size={18} />} label="Win rate" value={`${percentFormatter.format(data.winRate * 100)}%`} />
      </section>

      <section className="dashboard-grid">
        <article className="chart-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">D3 visualisation</p>
              <h2>Portfolio value and cumulative P/L</h2>
            </div>
            <span>{new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <ProfitChart points={data.equity} />
        </article>

        <aside className="action-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Bot status</p>
              <h2>Last action</h2>
            </div>
          </div>
          <p>{data.lastAction}</p>
          <div className="risk-stack">
            <span>Take profit</span>
            <strong>1.2%</strong>
            <span>Stop loss</span>
            <strong>2.0%</strong>
            <span>Max hold</span>
            <strong>180m</strong>
          </div>
        </aside>
      </section>

      <section className="trade-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current trades</p>
            <h2>Open positions</h2>
          </div>
          <span>{openTrades.length} active</span>
        </div>
        <div className="trade-cards">
          {openTrades.map((trade) => (
            <TradeCard key={trade.id} trade={trade} />
          ))}
        </div>
      </section>

      <section className="trade-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Transaction tape</p>
            <h2>Revenue by trade</h2>
          </div>
          <span>{closedTrades.length} closed</span>
        </div>
        <TradeTable trades={data.trades} />
      </section>
    </main>
  );
}

function ProfitChart({ points }: { points: EquityPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        date: new Date(point.time)
      })),
    [points]
  );

  useEffect(() => {
    const svgNode = svgRef.current;
    const tooltipNode = tooltipRef.current;
    if (!svgNode || !tooltipNode || parsed.length === 0) {
      return;
    }

    const width = 920;
    const height = 380;
    const margin = { top: 24, right: 34, bottom: 42, left: 64 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xExtent = d3.extent(parsed, (point) => point.date) as [Date, Date];
    const pnlExtent = d3.extent(parsed, (point) => point.cumulativePnlUsdt) as [number, number];
    const valueExtent = d3.extent(parsed, (point) => point.portfolioValueUsdt) as [number, number];
    const x = d3.scaleTime().domain(xExtent).range([0, innerWidth]);
    const yPnl = d3
      .scaleLinear()
      .domain([Math.min(pnlExtent[0], -1), Math.max(pnlExtent[1], 1)])
      .nice()
      .range([innerHeight, 0]);
    const yValue = d3.scaleLinear().domain(valueExtent).nice().range([innerHeight, 0]);
    const svg = d3.select(svgNode);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img");

    const defs = svg.append("defs");
    const pnlGradient = defs.append("linearGradient").attr("id", "pnl-gradient").attr("x1", "0").attr("x2", "0").attr("y1", "0").attr("y2", "1");
    pnlGradient.append("stop").attr("offset", "0%").attr("stop-color", "#22c55e").attr("stop-opacity", "0.42");
    pnlGradient.append("stop").attr("offset", "100%").attr("stop-color", "#22c55e").attr("stop-opacity", "0.02");
    const glow = defs.append("filter").attr("id", "chart-glow").attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "160%");
    glow.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    glow.append("feMerge").append("feMergeNode").attr("in", "blur");
    glow.select("feMerge").append("feMergeNode").attr("in", "SourceGraphic");

    const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const area = d3
      .area<(typeof parsed)[number]>()
      .x((point) => x(point.date))
      .y0(innerHeight)
      .y1((point) => yPnl(point.cumulativePnlUsdt))
      .curve(d3.curveCatmullRom.alpha(0.5));
    const pnlLine = d3
      .line<(typeof parsed)[number]>()
      .x((point) => x(point.date))
      .y((point) => yPnl(point.cumulativePnlUsdt))
      .curve(d3.curveCatmullRom.alpha(0.5));
    const valueLine = d3
      .line<(typeof parsed)[number]>()
      .x((point) => x(point.date))
      .y((point) => yValue(point.portfolioValueUsdt))
      .curve(d3.curveCatmullRom.alpha(0.5));

    root
      .append("g")
      .attr("class", "grid-lines")
      .call(d3.axisLeft(yPnl).ticks(5).tickSize(-innerWidth).tickFormat(() => ""));
    root
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickSizeOuter(0));
    root.append("g").attr("class", "axis").call(d3.axisLeft(yPnl).ticks(5));
    root.append("path").datum(parsed).attr("class", "pnl-area").attr("d", area);
    root.append("path").datum(parsed).attr("class", "value-line").attr("d", valueLine).attr("filter", "url(#chart-glow)");
    root.append("path").datum(parsed).attr("class", "pnl-line").attr("d", pnlLine).attr("filter", "url(#chart-glow)");

    const focus = root.append("g").attr("class", "focus-dot").style("display", "none");
    focus.append("line").attr("y1", 0).attr("y2", innerHeight);
    focus.append("circle").attr("r", 5);
    const bisect = d3.bisector<(typeof parsed)[number], Date>((point) => point.date).center;

    root
      .append("rect")
      .attr("class", "hit-area")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .on("pointerenter", () => {
        focus.style("display", null);
        tooltipNode.hidden = false;
      })
      .on("pointerleave", () => {
        focus.style("display", "none");
        tooltipNode.hidden = true;
      })
      .on("pointermove", (event) => {
        const [mouseX] = d3.pointer(event);
        const index = bisect(parsed, x.invert(mouseX));
        const point = parsed[Math.max(0, Math.min(parsed.length - 1, index))];
        const focusX = x(point.date);
        const focusY = yPnl(point.cumulativePnlUsdt);
        focus.attr("transform", `translate(${focusX},0)`);
        focus.select("circle").attr("cy", focusY);
        tooltipNode.style.left = `${(focusX / innerWidth) * 100}%`;
        tooltipNode.style.top = `${Math.max(10, focusY - 18)}px`;
        tooltipNode.innerHTML = `<strong>${formatSignedMoney(point.cumulativePnlUsdt)}</strong><span>${formatMoney(point.portfolioValueUsdt)} value</span>`;
      });
  }, [parsed]);

  return (
    <div className="chart-wrap">
      <svg ref={svgRef} aria-label="Portfolio value and profit loss over time" />
      <div ref={tooltipRef} className="chart-tooltip" hidden />
      <div className="chart-legend">
        <span className="legend-value">Portfolio value</span>
        <span className="legend-pnl">Cumulative P/L</span>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  return (
    <article className={`metric metric--${tone}`}>
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function TradeCard({ trade }: { trade: TradeRow }) {
  const positive = trade.revenueUsdt >= 0;
  return (
    <article className="trade-card">
      <div>
        <p>{trade.mode}</p>
        <h3>{trade.pair}</h3>
      </div>
      <span className={positive ? "chip chip--good" : "chip chip--bad"}>
        {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {formatSignedMoney(trade.revenueUsdt)}
      </span>
      <dl>
        <div>
          <dt>Entry</dt>
          <dd>{formatMoney(trade.entryPrice)}</dd>
        </div>
        <div>
          <dt>Current</dt>
          <dd>{formatMoney(trade.currentPrice)}</dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd>{compactFormatter.format(trade.volume)}</dd>
        </div>
        <div>
          <dt>P/L</dt>
          <dd className={positive ? "positive" : "negative"}>{percentFormatter.format(trade.pnlPct)}%</dd>
        </div>
      </dl>
      <p>{trade.note}</p>
    </article>
  );
}

function TradeTable({ trades }: { trades: TradeRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pair</th>
            <th>Status</th>
            <th>Entry</th>
            <th>Current/exit</th>
            <th>Volume</th>
            <th>Revenue</th>
            <th>P/L</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id}>
              <td>{trade.pair}</td>
              <td>{trade.status}</td>
              <td>{formatMoney(trade.entryPrice)}</td>
              <td>{formatMoney(trade.currentPrice)}</td>
              <td>{compactFormatter.format(trade.volume)}</td>
              <td className={trade.revenueUsdt >= 0 ? "positive" : "negative"}>{formatSignedMoney(trade.revenueUsdt)}</td>
              <td className={trade.pnlPct >= 0 ? "positive" : "negative"}>{percentFormatter.format(trade.pnlPct)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function formatSignedMoney(value: number) {
  const formatted = moneyFormatter.format(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

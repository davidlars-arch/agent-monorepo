"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  Calculator,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  KeyRound,
  Landmark,
  RefreshCcw,
  ShieldCheck,
  UserRound
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  calculateSwedishCryptoTax,
  parseTransactions,
  sampleCsv,
  type DisposalRow,
  type HoldingLot
} from "@/lib/crypto-tax";

const sekFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0
});

const quantityFormatter = new Intl.NumberFormat("sv-SE", {
  maximumFractionDigits: 8
});

export function TaxWorkbench() {
  const [csv, setCsv] = useState(sampleCsv);
  const [profileName, setProfileName] = useState("David");
  const [publicKeys, setPublicKeys] = useState(
    "bc1q-example-watch-only-wallet\n0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseTransactions(csv), [csv]);
  const report = useMemo(() => calculateSwedishCryptoTax(parsed.transactions), [parsed.transactions]);
  const taxImpactLabel = report.totals.estimatedTaxSek >= 0 ? "Estimated tax" : "Estimated tax reduction";
  const watchedWallets = useMemo(
    () => publicKeys.split(/\r?\n/).map((key) => key.trim()).filter(Boolean),
    [publicKeys]
  );
  const profileStatus =
    parsed.errors.length + report.reviewItems.length === 0 ? "Ready for review" : "Needs cleanup before filing";

  function handleCsvUpload(file: File | undefined) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setCsv(String(reader.result ?? ""));
    });
    reader.readAsText(file);
  }

  return (
    <main className="tax-shell">
      <aside className="sidebar" aria-label="Product navigation">
        <div className="brand-block">
          <div className="brand-mark">
            <Landmark size={18} />
          </div>
          <div>
            <p>Skattkarta</p>
            <strong>Crypto</strong>
          </div>
        </div>

        <nav className="side-nav" aria-label="Sections">
          <a className="is-active" href="#workbench">
            <Calculator size={16} />
            Workbench
          </a>
          <a href="#k4">
            <FileSpreadsheet size={16} />
            K4 draft
          </a>
          <a href="#review">
            <AlertTriangle size={16} />
            Review queue
          </a>
        </nav>

        <div className="rule-panel">
          <ShieldCheck size={18} />
          <p>
            Sweden-first MVP using average cost, 30% capital tax estimate, and 70% loss deductibility for private crypto
            disposals.
          </p>
        </div>
      </aside>

      <section className="workspace" id="workbench">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Koinly competitor seed</p>
            <h1>Crypto tax workbench for Sweden</h1>
          </div>
          <div className="header-actions">
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={16} />
              Upload CSV
            </button>
            <button type="button" onClick={() => setCsv(sampleCsv)}>
              <RefreshCcw size={16} />
              Sample
            </button>
            <button type="button">
              <ArrowDownToLine size={16} />
              Export later
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => handleCsvUpload(event.target.files?.[0])}
              aria-label="Upload CSV transactions"
            />
          </div>
        </header>

        <section className="profile-panel" aria-label="Tax profile">
          <div className="profile-card">
            <div className="profile-card__icon">
              <UserRound size={18} />
            </div>
            <label>
              Profile
              <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
            </label>
            <div>
              <span>Current tax fee estimate</span>
              <strong>{formatSek(Math.abs(report.totals.estimatedTaxSek))}</strong>
              <p>{taxImpactLabel} for {profileName || "this profile"}</p>
            </div>
          </div>

          <div className="wallet-panel">
            <div className="section-heading section-heading--compact">
              <div>
                <p className="eyebrow">Public keys</p>
                <h2>Watched wallets</h2>
              </div>
              <span>{watchedWallets.length} watched</span>
            </div>
            <div className="wallet-panel__body">
              <KeyRound size={18} />
              <textarea
                value={publicKeys}
                spellCheck={false}
                onChange={(event) => setPublicKeys(event.target.value)}
                aria-label="Public wallet keys"
              />
            </div>
            <p className="helper-text">
              Paste one public address per line. Chain fetching is still a stub; CSV import remains the source of tax
              calculations for now.
            </p>
          </div>

          <div className="profile-status">
            <span>{profileStatus}</span>
            <strong>{parsed.transactions.length}</strong>
            <p>transactions loaded into this profile</p>
          </div>
        </section>

        <section className="summary-grid" aria-label="Tax summary">
          <Metric label="Disposals" value={String(report.disposals.length)} detail="Sales and crypto-to-crypto trades" />
          <Metric label="Net taxable capital" value={formatSek(report.totals.taxableCapitalSek)} detail="Gains minus 70% of losses" />
          <Metric label={taxImpactLabel} value={formatSek(Math.abs(report.totals.estimatedTaxSek))} detail="30% capital tax estimate" />
          <Metric label="Needs review" value={String(parsed.errors.length + report.reviewItems.length)} detail="Import gaps and tax edge cases" />
        </section>

        <div className="main-grid">
          <section className="import-panel" aria-label="CSV import">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Import</p>
                <h2>Paste exchange CSV</h2>
              </div>
              <span>{parsed.transactions.length} rows parsed</span>
            </div>
            <textarea
              value={csv}
              spellCheck={false}
              onChange={(event) => setCsv(event.target.value)}
              aria-label="CSV transactions"
            />
            <p className="helper-text">
              Required columns: date, type, asset, quantity, total_sek, fee_sek. Trades can also include received_asset and
              received_quantity.
            </p>
          </section>

          <section className="breakdown-panel" aria-label="Swedish tax calculation">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Calculation</p>
                <h2>Swedish capital estimate</h2>
              </div>
              <CheckCircle2 size={18} />
            </div>
            <dl className="tax-breakdown">
              <BreakdownRow label="Sale proceeds" value={report.totals.proceedsSek} />
              <BreakdownRow label="Cost basis" value={report.totals.costBasisSek} />
              <BreakdownRow label="Gross gains" value={report.totals.gainsSek} />
              <BreakdownRow label="Gross losses" value={-report.totals.lossesSek} />
              <BreakdownRow label="70% deductible loss" value={-report.totals.deductibleLossSek} />
              <BreakdownRow label="Taxable capital" value={report.totals.taxableCapitalSek} strong />
            </dl>
            <p className="helper-text">
              Built from Skatteverket guidance for crypto disposals as capital assets. This is a filing draft, not a legal
              opinion.
            </p>
          </section>
        </div>

        <section className="data-section" id="k4" aria-label="K4 disposal draft">
          <div className="section-heading">
            <div>
              <p className="eyebrow">K4 draft</p>
              <h2>Disposals by asset</h2>
            </div>
            <span>{formatSek(report.totals.gainsSek - report.totals.lossesSek)} gross result</span>
          </div>
          <DisposalsTable rows={report.disposals} />
        </section>

        <div className="bottom-grid">
          <section className="data-section" aria-label="Remaining holdings">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Portfolio</p>
                <h2>Remaining cost basis</h2>
              </div>
            </div>
            <HoldingsTable rows={report.holdings} />
          </section>

          <section className="data-section" id="review" aria-label="Review queue">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Review</p>
                <h2>Items before filing</h2>
              </div>
            </div>
            <ul className="review-list">
              {parsed.errors.map((error) => (
                <li key={error} className="review-list__error">
                  <AlertTriangle size={16} />
                  {error}
                </li>
              ))}
              {report.reviewItems.map((item) => (
                <li key={item.id} className={item.severity === "error" ? "review-list__error" : ""}>
                  <AlertTriangle size={16} />
                  {item.message}
                </li>
              ))}
              {parsed.errors.length === 0 && report.reviewItems.length === 0 ? (
                <li>
                  <CheckCircle2 size={16} />
                  No blocking review items in this import.
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function BreakdownRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "is-strong" : undefined}>
      <dt>{label}</dt>
      <dd>{formatSek(value)}</dd>
    </div>
  );
}

function DisposalsTable({ rows }: { rows: DisposalRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Asset</th>
            <th>Qty</th>
            <th>Proceeds</th>
            <th>Cost basis</th>
            <th>Gain/loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.date}</td>
              <td>{row.type}</td>
              <td>{row.asset}</td>
              <td>{quantityFormatter.format(row.quantity)}</td>
              <td>{formatSek(row.proceedsSek)}</td>
              <td>{formatSek(row.costBasisSek)}</td>
              <td className={row.gainSek >= 0 ? "positive" : "negative"}>{formatSek(row.gainSek)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldingsTable({ rows }: { rows: HoldingLot[] }) {
  return (
    <div className="table-wrap table-wrap--compact">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Qty</th>
            <th>Cost basis</th>
            <th>Avg cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.asset}>
              <td>{row.asset}</td>
              <td>{quantityFormatter.format(row.quantity)}</td>
              <td>{formatSek(row.costBasisSek)}</td>
              <td>{formatSek(row.averageCostSek)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatSek(value: number) {
  return sekFormatter.format(value);
}

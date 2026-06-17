export type TransactionType = "buy" | "sell" | "trade" | "income" | "fee";

export type CryptoTransaction = {
  id: string;
  date: string;
  type: TransactionType;
  asset: string;
  quantity: number;
  totalSek: number;
  feeSek: number;
  receivedAsset?: string;
  receivedQuantity?: number;
  source?: string;
  note?: string;
};

export type DisposalRow = {
  id: string;
  date: string;
  asset: string;
  quantity: number;
  proceedsSek: number;
  costBasisSek: number;
  gainSek: number;
  averageCostSek: number;
  type: "sell" | "trade";
  note?: string;
};

export type HoldingLot = {
  asset: string;
  quantity: number;
  costBasisSek: number;
  averageCostSek: number;
};

export type ReviewItem = {
  id: string;
  severity: "warning" | "error";
  message: string;
};

export type TaxReport = {
  disposals: DisposalRow[];
  holdings: HoldingLot[];
  reviewItems: ReviewItem[];
  totals: {
    proceedsSek: number;
    costBasisSek: number;
    gainsSek: number;
    lossesSek: number;
    deductibleLossSek: number;
    taxableCapitalSek: number;
    estimatedTaxSek: number;
  };
};

type Position = {
  quantity: number;
  costBasisSek: number;
};

const TAX_RATE = 0.3;
const LOSS_DEDUCTIBLE_RATE = 0.7;

export const sampleCsv = `date,type,asset,quantity,total_sek,fee_sek,received_asset,received_quantity,source,note
2025-01-08,buy,BTC,0.08,36000,99,,,Kraken,initial buy
2025-02-14,buy,ETH,1.2,42000,129,,,Coinbase,monthly DCA
2025-05-02,trade,ETH,0.35,13200,49,SOL,22.4,Wallet,ETH to SOL swap
2025-08-19,sell,BTC,0.025,14200,59,,,Kraken,partial sale
2025-11-03,sell,SOL,10,5100,29,,,Coinbase,sold SOL
2025-12-12,income,USDC,240,2400,0,,,DeFi,reward income`;

export function parseTransactions(csv: string): { transactions: CryptoTransaction[]; errors: string[] } {
  const rows = csv
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    return { transactions: [], errors: ["Paste a header row and at least one transaction."] };
  }

  const headers = splitCsvRow(rows[0]).map(normalizeHeader);
  const errors: string[] = [];
  const transactions: CryptoTransaction[] = [];

  rows.slice(1).forEach((row, index) => {
    const values = splitCsvRow(row);
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? ""]));
    const type = normalizeType(record.type);
    const id = `${record.date || "row"}-${index + 2}`;
    const asset = record.asset?.toUpperCase();
    const quantity = parseNumber(record.quantity);
    const totalSek = parseNumber(record.totalSek);
    const feeSek = parseNumber(record.feeSek);

    if (!record.date || Number.isNaN(Date.parse(record.date))) {
      errors.push(`Row ${index + 2}: missing or invalid date.`);
    }

    if (!type) {
      errors.push(`Row ${index + 2}: type must be buy, sell, trade, income, or fee.`);
    }

    if (!asset) {
      errors.push(`Row ${index + 2}: missing asset.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`Row ${index + 2}: quantity must be greater than zero.`);
    }

    if (!Number.isFinite(totalSek) || totalSek < 0) {
      errors.push(`Row ${index + 2}: total_sek must be zero or greater.`);
    }

    if (!Number.isFinite(feeSek) || feeSek < 0) {
      errors.push(`Row ${index + 2}: fee_sek must be zero or greater.`);
    }

    if (!type || !asset || !Number.isFinite(quantity) || !Number.isFinite(totalSek) || !Number.isFinite(feeSek)) {
      return;
    }

    transactions.push({
      id,
      date: record.date,
      type,
      asset,
      quantity,
      totalSek,
      feeSek,
      receivedAsset: record.receivedAsset?.toUpperCase() || undefined,
      receivedQuantity: parseOptionalNumber(record.receivedQuantity),
      source: record.source || undefined,
      note: record.note || undefined
    });
  });

  return {
    transactions: transactions.sort((left, right) => Date.parse(left.date) - Date.parse(right.date)),
    errors
  };
}

export function calculateSwedishCryptoTax(transactions: CryptoTransaction[]): TaxReport {
  const positions = new Map<string, Position>();
  const disposals: DisposalRow[] = [];
  const reviewItems: ReviewItem[] = [];

  for (const transaction of transactions) {
    const position = getPosition(positions, transaction.asset);

    if (transaction.type === "buy" || transaction.type === "income") {
      addAcquisition(position, transaction.quantity, transaction.totalSek + transaction.feeSek);
      if (transaction.type === "income") {
        reviewItems.push({
          id: `${transaction.id}-income`,
          severity: "warning",
          message: `${transaction.asset} income may also need separate income reporting before it becomes cost basis.`
        });
      }
      continue;
    }

    if (transaction.type === "fee") {
      addAcquisition(position, transaction.quantity, transaction.feeSek || transaction.totalSek);
      reviewItems.push({
        id: `${transaction.id}-fee`,
        severity: "warning",
        message: `${transaction.asset} fee-only rows are tracked as cost basis placeholders. Confirm treatment before filing.`
      });
      continue;
    }

    const disposal = disposeAsset(transaction, position);
    disposals.push(disposal);

    if (position.quantity < -0.00000001) {
      reviewItems.push({
        id: `${transaction.id}-negative`,
        severity: "error",
        message: `${transaction.asset} goes negative after ${transaction.date}. Import earlier buys or transfers.`
      });
    }

    if (transaction.type === "trade") {
      if (!transaction.receivedAsset || !transaction.receivedQuantity) {
        reviewItems.push({
          id: `${transaction.id}-trade-target`,
          severity: "warning",
          message: `Trade on ${transaction.date} is missing received asset or quantity.`
        });
        continue;
      }

      const receivedPosition = getPosition(positions, transaction.receivedAsset);
      addAcquisition(receivedPosition, transaction.receivedQuantity, transaction.totalSek);
    }
  }

  const gainsSek = sum(disposals.filter((row) => row.gainSek > 0).map((row) => row.gainSek));
  const lossesSek = Math.abs(sum(disposals.filter((row) => row.gainSek < 0).map((row) => row.gainSek)));
  const deductibleLossSek = lossesSek * LOSS_DEDUCTIBLE_RATE;
  const taxableCapitalSek = gainsSek - deductibleLossSek;

  return {
    disposals,
    holdings: [...positions.entries()]
      .map(([asset, position]) => ({
        asset,
        quantity: sanitizeTiny(position.quantity),
        costBasisSek: sanitizeTiny(position.costBasisSek),
        averageCostSek: position.quantity > 0 ? position.costBasisSek / position.quantity : 0
      }))
      .filter((holding) => Math.abs(holding.quantity) > 0.00000001 || Math.abs(holding.costBasisSek) > 0.01)
      .sort((left, right) => left.asset.localeCompare(right.asset)),
    reviewItems,
    totals: {
      proceedsSek: sum(disposals.map((row) => row.proceedsSek)),
      costBasisSek: sum(disposals.map((row) => row.costBasisSek)),
      gainsSek,
      lossesSek,
      deductibleLossSek,
      taxableCapitalSek,
      estimatedTaxSek: taxableCapitalSek * TAX_RATE
    }
  };
}

function disposeAsset(transaction: CryptoTransaction, position: Position): DisposalRow {
  const averageCostSek = position.quantity > 0 ? position.costBasisSek / position.quantity : 0;
  const costBasisSek = averageCostSek * transaction.quantity;
  const proceedsSek = Math.max(0, transaction.totalSek - transaction.feeSek);

  position.quantity -= transaction.quantity;
  position.costBasisSek -= costBasisSek;

  return {
    id: transaction.id,
    date: transaction.date,
    asset: transaction.asset,
    quantity: transaction.quantity,
    proceedsSek,
    costBasisSek,
    gainSek: proceedsSek - costBasisSek,
    averageCostSek,
    type: transaction.type === "trade" ? "trade" : "sell",
    note: transaction.note
  };
}

function addAcquisition(position: Position, quantity: number, costBasisSek: number) {
  position.quantity += quantity;
  position.costBasisSek += costBasisSek;
}

function getPosition(positions: Map<string, Position>, asset: string) {
  const existing = positions.get(asset);
  if (existing) {
    return existing;
  }

  const next = { quantity: 0, costBasisSek: 0 };
  positions.set(asset, next);
  return next;
}

function normalizeHeader(header: string) {
  const normalized = header.trim().toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, char: string) => char.toUpperCase());
  if (normalized === "totalsek") {
    return "totalSek";
  }
  if (normalized === "feesek") {
    return "feeSek";
  }
  if (normalized === "receivedasset") {
    return "receivedAsset";
  }
  if (normalized === "receivedquantity") {
    return "receivedQuantity";
  }
  return normalized;
}

function normalizeType(value: string): TransactionType | null {
  const normalized = value.trim().toLowerCase();
  if (["buy", "sell", "trade", "income", "fee"].includes(normalized)) {
    return normalized as TransactionType;
  }
  return null;
}

function parseNumber(value: string) {
  return Number(value.replace(/\s/g, "").replace(",", "."));
}

function parseOptionalNumber(value: string) {
  if (!value) {
    return undefined;
  }
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitCsvRow(row: string) {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const next = row[index + 1];

    if (char === "\"" && next === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function sanitizeTiny(value: number) {
  return Math.abs(value) < 0.00000001 ? 0 : value;
}

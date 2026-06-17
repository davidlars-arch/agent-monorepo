import { createHash, createHmac } from "node:crypto";

import type { Candle } from "./indicators.js";

const KRAKEN_API_URL = "https://api.kraken.com";

export type KrakenAssetPair = {
  altname: string;
  wsname?: string;
  base: string;
  quote: string;
  status?: string;
  ordermin?: string;
  lot_decimals?: number;
  pair_decimals?: number;
};

type KrakenResponse<T> = {
  error: string[];
  result: T;
};

export class KrakenClient {
  async assetPairs(): Promise<KrakenAssetPair[]> {
    const result = await this.publicGet<Record<string, KrakenAssetPair>>("/0/public/AssetPairs");
    return Object.values(result);
  }

  async ohlc(pair: string, interval = 5): Promise<Candle[]> {
    const result = await this.publicGet<Record<string, unknown>>("/0/public/OHLC", {
      pair,
      interval: String(interval)
    });
    const key = Object.keys(result).find((name) => name !== "last");
    if (!key || !Array.isArray(result[key])) {
      throw new Error(`No OHLC result returned for ${pair}`);
    }

    return (result[key] as unknown[][]).map((row) => ({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[6])
    }));
  }

  async addMarketOrder(input: {
    pair: string;
    side: "buy" | "sell";
    volume: string;
    validate?: boolean;
  }): Promise<unknown> {
    return this.privatePost("/0/private/AddOrder", {
      pair: input.pair,
      type: input.side,
      ordertype: "market",
      volume: input.volume,
      validate: input.validate ? "true" : undefined
    });
  }

  private async publicGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, KRAKEN_API_URL);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url);
    return parseKrakenResponse<T>(response);
  }

  private async privatePost<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
    const apiKey = process.env.KRAKEN_API_KEY;
    const apiSecret = process.env.KRAKEN_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error("KRAKEN_API_KEY and KRAKEN_API_SECRET are required for private Kraken calls.");
    }

    const nonce = Date.now().toString();
    const body = new URLSearchParams();
    body.set("nonce", nonce);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        body.set(key, value);
      }
    }

    const encodedBody = body.toString();
    const signature = signRequest(path, nonce, encodedBody, apiSecret);
    const response = await fetch(new URL(path, KRAKEN_API_URL), {
      method: "POST",
      headers: {
        "API-Key": apiKey,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: encodedBody
    });

    return parseKrakenResponse<T>(response);
  }
}

function signRequest(path: string, nonce: string, encodedBody: string, apiSecret: string): string {
  const sha256 = createHash("sha256")
    .update(nonce + encodedBody)
    .digest();
  return createHmac("sha512", Buffer.from(apiSecret, "base64"))
    .update(path)
    .update(sha256)
    .digest("base64");
}

async function parseKrakenResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Kraken HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as KrakenResponse<T>;
  if (payload.error.length > 0) {
    throw new Error(`Kraken API error: ${payload.error.join(", ")}`);
  }

  return payload.result;
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type TraderPosition = {
  pair: string;
  side: "long";
  entryPrice: number;
  volume: number;
  openedAt: string;
  mode: "dry-run" | "live";
};

export type TraderState = {
  position?: TraderPosition;
  lastAction?: string;
  updatedAt?: string;
};

export async function readState(path: string): Promise<TraderState> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as TraderState;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeState(path: string, state: TraderState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

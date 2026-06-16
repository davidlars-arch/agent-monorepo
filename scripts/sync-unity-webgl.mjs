#!/usr/bin/env node

import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, "games", "ff6-inspired-rpg", "webgl-build");
const destination = join(root, "apps", "web", "public", "unity-build");

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });

console.log(`Synced ${relative(source)} -> ${relative(destination)}`);

function relative(path) {
  return path.replace(`${root}/`, "");
}

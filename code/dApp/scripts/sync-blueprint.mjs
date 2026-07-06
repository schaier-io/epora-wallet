import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Mirrors the canonical contract blueprint (code/smart-contract/plutus.json) into
// the dApp (src/lib/contracts/plutus.json).
//
//   node ./scripts/sync-blueprint.mjs          copy source -> dApp mirror
//   node ./scripts/sync-blueprint.mjs --check   verify the mirror is in sync
//
// --check writes nothing and exits non-zero when the mirror is missing or stale,
// so CI can fail a PR whose checked-in blueprint drifted from the contract (the
// validator hash IS the on-chain address, so a stale mirror = wrong address).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const checkOnly = process.argv.includes("--check");

const source = path.resolve(__dirname, "../../smart-contract/plutus.json");
const destination = path.resolve(__dirname, "../src/lib/contracts/plutus.json");

if (!fs.existsSync(source)) {
  throw new Error(`Blueprint source not found: ${source}`);
}

if (checkOnly) {
  const sourceContent = fs.readFileSync(source, "utf8");
  const destinationContent = fs.existsSync(destination)
    ? fs.readFileSync(destination, "utf8")
    : null;

  if (sourceContent === destinationContent) {
    console.log("Blueprint mirror is in sync.");
    process.exit(0);
  }

  console.error(
    "Blueprint mirror is stale or missing.\n" +
      `  source: ${source}\n` +
      `  mirror: ${destination}\n` +
      "Run `pnpm run sync:blueprint` and commit the result."
  );
  process.exit(1);
}

fs.copyFileSync(source, destination);
console.log(`Blueprint synced: ${source} -> ${destination}`);

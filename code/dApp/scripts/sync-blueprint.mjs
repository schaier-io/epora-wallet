import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = path.resolve(
  __dirname,
  "../../smart-contract/plutus.json"
);
const destination = path.resolve(__dirname, "../src/lib/contracts/plutus.json");

if (!fs.existsSync(source)) {
  throw new Error(`Blueprint source not found: ${source}`);
}

fs.copyFileSync(source, destination);
console.log(`Blueprint synced: ${source} -> ${destination}`);

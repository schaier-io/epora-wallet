import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../src/lib/api/openapi";

// Generates the public OpenAPI document from the same zod schemas the routes
// validate with, so the spec cannot describe a shape the routes do not accept.
//
//   node --import tsx ./scripts/build-openapi.ts           write docs/api/openapi.json
//   node --import tsx ./scripts/build-openapi.ts --check   verify it is in sync
//
// --check writes nothing and exits non-zero when the committed document is
// missing or stale, so CI fails a PR that changed a schema without regenerating.
// Mirrors sync-blueprint.mjs, which guards the contract blueprint the same way.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const destination = path.resolve(__dirname, "../../../docs/api/openapi.json");
const checkOnly = process.argv.includes("--check");

const generated = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;

if (checkOnly) {
  if (!fs.existsSync(destination)) {
    console.error(`OpenAPI document missing: ${destination}`);
    console.error("Run `pnpm openapi` and commit the result.");
    process.exit(1);
  }

  if (fs.readFileSync(destination, "utf8") !== generated) {
    console.error(`OpenAPI document is stale: ${destination}`);
    console.error("A schema changed without regenerating. Run `pnpm openapi` and commit the result.");
    process.exit(1);
  }

  console.log(`OpenAPI document is in sync: ${destination}`);
} else {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, generated);
  console.log(`Wrote ${destination}`);
}

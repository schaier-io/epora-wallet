// Mirrors the Swagger UI assets that /api/v1/docs serves out of
// node_modules/swagger-ui-dist into public/api-docs/, the same way
// sync-blueprint.mjs mirrors the contract blueprint. public/api-docs/ is
// gitignored; postinstall keeps it current with the installed version.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve("swagger-ui-dist/package.json"));
const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/api-docs"
);

mkdirSync(target, { recursive: true });
for (const file of ["swagger-ui.css", "swagger-ui-bundle.js"]) {
  copyFileSync(path.join(source, file), path.join(target, file));
}

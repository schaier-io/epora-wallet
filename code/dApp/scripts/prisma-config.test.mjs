import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("../", import.meta.url);
const pooled = "postgresql://postgres@localhost:5432/wallet";
const direct = "postgresql://postgres@localhost:5433/wallet";

function readConfiguration(databaseUrl, unpooledUrl) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_URL_UNPOOLED;
  if (databaseUrl !== undefined) env.DATABASE_URL = databaseUrl;
  if (unpooledUrl !== undefined) env.DATABASE_URL_UNPOOLED = unpooledUrl;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { createRequire } from 'node:module';
    const config = createRequire(import.meta.url)('./prisma.config.ts').default;
    console.log(JSON.stringify(config.datasource));
  `], { cwd, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("Prisma CLI uses the direct URL when both database URLs are set", () => {
  assert.equal(readConfiguration(pooled, direct).url, direct);
});

test("Prisma CLI can use the direct URL without a runtime URL", () => {
  assert.equal(readConfiguration(undefined, direct).url, direct);
});

test("Prisma CLI falls back to DATABASE_URL for local development", () => {
  assert.equal(readConfiguration(pooled, undefined).url, pooled);
});

test("a blank optional direct URL keeps the local fallback", () => {
  assert.equal(readConfiguration(pooled, "").url, pooled);
});

test("the runtime adapter keeps the pooled URL when a direct URL exists", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { createPrismaAdapter } from './src/lib/prisma-adapter.ts';
    console.log(createPrismaAdapter().config.connectionString);
  `], {
    cwd,
    env: { ...process.env, DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct },
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), pooled);
});

test("database tests cannot use an inherited direct deployment URL", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "wallet-prisma-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = path.join(directory, "prisma");
  writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n%s\\n" "$DATABASE_URL" "${DATABASE_URL_UNPOOLED-unset}"\nexit 7\n');
  chmodSync(executable, 0o755);
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const result = spawnSync(packageJson.scripts.test, {
    cwd,
    shell: true,
    env: {
      ...process.env,
      PATH: `${directory}${path.delimiter}${process.env.PATH}`,
      DATABASE_URL: pooled,
      DATABASE_URL_UNPOOLED: direct
    },
    encoding: "utf8"
  });
  assert.equal(result.status, 7);
  assert.deepEqual(result.stdout.trim().split("\n"), [`${pooled}?schema=stt_test`, "unset"]);
});

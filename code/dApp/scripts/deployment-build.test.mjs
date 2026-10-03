import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

function runDeploymentBuild(t, migrationExit, deploymentEnvironment = "production") {
  const directory = mkdtempSync(path.join(tmpdir(), "wallet-deploy-build-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = path.join(directory, "commands.log");
  for (const command of ["prisma", "pnpm"]) {
    const executable = path.join(directory, command);
    writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' "${command} $*" >> "$REPAIR_COMMAND_LOG"\nexit ${command === "prisma" ? migrationExit : 0}\n`);
    chmodSync(executable, 0o755);
  }
  assert.equal(vercel.buildCommand, "pnpm build:deploy");
  const env = { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}`, REPAIR_COMMAND_LOG: log };
  if (deploymentEnvironment === null) delete env.VERCEL_ENV;
  else env.VERCEL_ENV = deploymentEnvironment;
  const result = spawnSync(packageJson.scripts["build:deploy"], {
    shell: true,
    env
  });
  return { status: result.status, commands: readFileSync(log, "utf8").trim().split("\n") };
}

test("deployment applies migrations before starting the application build", t => {
  const result = runDeploymentBuild(t, 0);
  assert.equal(result.status, 0);
  assert.deepEqual(result.commands, ["prisma migrate deploy", "pnpm build"]);
});

test("a failed migration prevents the application build", t => {
  const result = runDeploymentBuild(t, 1);
  assert.equal(result.status, 1);
  assert.deepEqual(result.commands, ["prisma migrate deploy"]);
});

for (const environment of ["preview", "development", null]) {
  test(`deployment skips migrations in ${environment ?? "an unspecified environment"}`, t => {
    const result = runDeploymentBuild(t, 1, environment);
    assert.equal(result.status, 0);
    assert.deepEqual(result.commands, ["pnpm build"]);
  });
}

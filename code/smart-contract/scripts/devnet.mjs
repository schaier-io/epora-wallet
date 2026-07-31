#!/usr/bin/env node
// Start/stop the local Cardano devnet the off-chain scripts can run against.
//
// `up` blocks until Yaci Store answers, then prints the CARDANO_PROVIDER_URL to
// export — without that wait the first script would race the node's genesis and
// fail with a confusing connection error.
//
// Usage: node scripts/devnet.mjs up | down | status
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = join(projectRoot, "offchain", "devnet", "docker-compose.yml");
const providerUrl = "http://localhost:8080/api/v1/";
const command = process.argv[2] ?? "up";

function compose(...args) {
  return spawnSync("docker", ["compose", "-f", composeFile, ...args], {
    stdio: "inherit",
  });
}

function fail(message) {
  console.error(`devnet: ${message}`);
  process.exit(1);
}

function exitFromCompose(result, action) {
  if (result.error) {
    fail(`\`docker compose ${action}\` failed: ${result.error.message}`);
  }
  if (result.status === null) {
    fail(
      `\`docker compose ${action}\` terminated${result.signal ? ` by ${result.signal}` : ""}.`,
    );
  }
  process.exit(result.status);
}

if (!["up", "down", "status"].includes(command)) {
  fail(`unknown command '${command}' — expected up, down or status`);
}

if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  fail("Docker is not running. Start Docker Desktop (or your daemon) first.");
}

if (command === "down") {
  // `-v` so the next `up` starts from a clean genesis rather than replaying a
  // half-finished experiment's chain state.
  const result = compose("down", "-v");
  exitFromCompose(result, "down -v");
}

if (command === "status") {
  const result = compose("ps");
  exitFromCompose(result, "ps");
}

const started = compose("up", "-d");
if (started.status !== 0) fail("`docker compose up` failed — see the output above.");

// Yaci Store answers only once the node has produced its first blocks.
const deadline = Date.now() + 120_000;
process.stdout.write("devnet: waiting for the chain to accept queries");
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${providerUrl}blocks/latest`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (response.ok) {
      console.log("\n");
      console.log(`devnet: ready at ${providerUrl}`);
      console.log("Point the off-chain scripts at it with:\n");
      console.log(`  export CARDANO_PROVIDER_URL=${providerUrl}\n`);
      console.log("Block explorer: http://localhost:5173");
      console.log("Stop and wipe state: pnpm devnet:down");
      process.exit(0);
    }
  } catch {
    // Not listening yet — keep waiting.
  }
  process.stdout.write(".");
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.log();
fail(
  "the devnet did not become ready within 120s. Inspect it with:\n" +
    `  docker compose -f ${composeFile} logs`,
);

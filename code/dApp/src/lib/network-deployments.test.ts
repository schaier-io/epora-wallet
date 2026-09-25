import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { networkChoices, networkSwitchUrl, parseNetworkDeployments } from "./network-deployments";

test("network destinations are isolated origins and always open a clean wallet home", () => {
  const deployments = parseNetworkDeployments(" https://mainnet.example/ ", "https://preprod.example");
  assert.equal(networkSwitchUrl("mainnet", deployments), "https://mainnet.example/user");
  assert.equal(networkSwitchUrl("preprod", deployments), "https://preprod.example/user");
  assert.equal(networkSwitchUrl("preview", deployments), undefined);
  assert.deepEqual(parseNetworkDeployments("", undefined), { mainnet: undefined, preprod: undefined });
  assert.equal(networkSwitchUrl("mainnet", parseNetworkDeployments(undefined, undefined)), undefined);
});

test("configured switch destinations reject unsafe or state-carrying URLs", () => {
  // Each failure names the variable to fix, including input that is not a URL at all.
  for (const url of ["mainnet.example", "/user", "javascript:alert(1)", "http://mainnet.example", "https://u:p@mainnet.example", "https://mainnet.example/user", "https://mainnet.example?wallet=unit", "https://mainnet.example#proposal", "https://mainnet.example.evil/user"]) {
    assert.throws(() => parseNetworkDeployments(url, undefined), /NEXT_PUBLIC_MAINNET_URL must be an HTTPS origin/, url);
  }
  assert.throws(() => parseNetworkDeployments(undefined, "preprod.example"), /NEXT_PUBLIC_PREPROD_URL must be an HTTPS origin/);
  assert.throws(() => parseNetworkDeployments("https://wallet.example", "https://wallet.example:8443"), /different hostnames/);
});

// Every HTML route renders per request, so without this the build passes and each page fails.
test("Next configuration rejects a malformed switch URL before a build starts", () => {
  assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e", "await import('./next.config.mjs')"], {
    env: { ...process.env, NEXT_PUBLIC_MAINNET_URL: "mainnet.example", NEXT_PUBLIC_PREPROD_URL: "", SENTRY_AUTH_TOKEN: "" }, stdio: "pipe"
  }), /NEXT_PUBLIC_MAINNET_URL must be an HTTPS origin/);
});

test("the switch offers only live networks, and nothing when there is nowhere to go", () => {
  const both = parseNetworkDeployments("https://mainnet.example", "https://preprod.example");
  assert.deepEqual(networkChoices("preprod", both), [
    { network: "preprod", active: true },
    { network: "mainnet", active: false, href: "https://mainnet.example/user" }
  ]);
  assert.deepEqual(networkChoices("preprod", parseNetworkDeployments("https://mainnet.example", undefined)), [
    { network: "preprod", active: true },
    { network: "mainnet", active: false, href: "https://mainnet.example/user" }
  ]);
  assert.deepEqual(networkChoices("mainnet", both), [
    { network: "preprod", active: false, href: "https://preprod.example/user" },
    { network: "mainnet", active: true }
  ]);
  assert.deepEqual(networkChoices("mainnet", parseNetworkDeployments(undefined, "https://preprod.example")), [
    { network: "preprod", active: false, href: "https://preprod.example/user" },
    { network: "mainnet", active: true }
  ]);
  assert.deepEqual(networkChoices("mainnet", parseNetworkDeployments("https://mainnet.example", undefined)), []);
  assert.deepEqual(networkChoices("preprod", parseNetworkDeployments(undefined, "https://preprod.example")), []);
  assert.deepEqual(networkChoices("preprod", parseNetworkDeployments(undefined, undefined)), []);
  assert.deepEqual(networkChoices("mainnet", parseNetworkDeployments(undefined, undefined)), []);
  assert.deepEqual(networkChoices("preview", both), [
    { network: "preprod", active: false, href: "https://preprod.example/user" },
    { network: "mainnet", active: false, href: "https://mainnet.example/user" }
  ]);
  assert.deepEqual(networkChoices("preview", parseNetworkDeployments(undefined, "https://preprod.example")), [
    { network: "preprod", active: false, href: "https://preprod.example/user" }
  ]);
  assert.deepEqual(networkChoices("preview", parseNetworkDeployments("https://mainnet.example", undefined)), [
    { network: "mainnet", active: false, href: "https://mainnet.example/user" }
  ]);
  assert.deepEqual(networkChoices("preview", parseNetworkDeployments(undefined, undefined)), []);
});

test("local parallel previews require distinct cookie hosts", () => {
  const deployments = parseNetworkDeployments("http://127.0.0.1:3017", "http://localhost:3018");
  assert.equal(networkSwitchUrl("mainnet", deployments), "http://127.0.0.1:3017/user");
  assert.equal(networkSwitchUrl("preprod", deployments), "http://localhost:3018/user");
  assert.throws(() => parseNetworkDeployments("http://localhost:3017", "http://localhost:3018"), /different hostnames/);
});

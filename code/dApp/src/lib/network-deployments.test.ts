import assert from "node:assert/strict";
import { test } from "node:test";
import { networkSwitchUrl, parseNetworkDeployments } from "./network-deployments";

test("network destinations are isolated origins and always open a clean wallet home", () => {
  const deployments = parseNetworkDeployments(" https://mainnet.example/ ", "https://preprod.example");
  assert.equal(networkSwitchUrl("mainnet", deployments), "https://mainnet.example/user");
  assert.equal(networkSwitchUrl("preprod", deployments), "https://preprod.example/user");
  assert.equal(networkSwitchUrl("preview", deployments), undefined);
  assert.deepEqual(parseNetworkDeployments("", undefined), { mainnet: undefined, preprod: undefined });
  assert.equal(networkSwitchUrl("mainnet", parseNetworkDeployments(undefined, undefined)), undefined);
});

test("configured switch destinations reject unsafe or state-carrying URLs", () => {
  for (const url of ["/user", "javascript:alert(1)", "http://mainnet.example", "https://u:p@mainnet.example", "https://mainnet.example/user", "https://mainnet.example?wallet=unit", "https://mainnet.example#proposal", "https://mainnet.example.evil/user"]) {
    assert.throws(() => parseNetworkDeployments(url, undefined), url);
  }
  assert.throws(() => parseNetworkDeployments("https://wallet.example", "https://wallet.example:8443"), /different hostnames/);
});

test("local parallel previews require distinct cookie hosts", () => {
  const deployments = parseNetworkDeployments("http://127.0.0.1:3017", "http://localhost:3018");
  assert.equal(networkSwitchUrl("mainnet", deployments), "http://127.0.0.1:3017/user");
  assert.equal(networkSwitchUrl("preprod", deployments), "http://localhost:3018/user");
  assert.throws(() => parseNetworkDeployments("http://localhost:3017", "http://localhost:3018"), /different hostnames/);
});

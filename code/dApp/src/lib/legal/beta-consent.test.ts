import { strict as assert } from "node:assert";
import { test } from "node:test";
import { betaConsentValue, hasBetaConsent, requiresBetaConsent, validBetaAcceptance } from "./beta-consent";
import { LEGAL_VERSION } from "../legal";

test("acknowledgement matches the exact current network and document version", () => {
  assert.equal(hasBetaConsent(betaConsentValue("mainnet"), "mainnet"), true);
  for (const value of [undefined, "accepted", "mainnet:old", "mainnet:epora-beta-1", betaConsentValue("preprod"), `${betaConsentValue("mainnet")}, other`]) {
    assert.equal(hasBetaConsent(value, "mainnet"), false);
  }
});

test("every checkbox and the current deployment must be explicit", () => {
  const body = { network: "mainnet", version: LEGAL_VERSION, beta: true, unaudited: true, totalLoss: true, liabilityRelease: true, terms: true };
  assert.equal(validBetaAcceptance(body, "mainnet"), true);
  for (const key of ["beta", "unaudited", "totalLoss", "liabilityRelease", "terms"]) {
    assert.equal(validBetaAcceptance({ ...body, [key]: undefined }, "mainnet"), false);
    assert.equal(validBetaAcceptance({ ...body, [key]: false }, "mainnet"), false);
    assert.equal(validBetaAcceptance({ ...body, [key]: "true" }, "mainnet"), false);
  }
  assert.equal(validBetaAcceptance({ ...body, network: "preprod" }, "mainnet"), false);
  assert.equal(validBetaAcceptance({ ...body, version: "old" }, "mainnet"), false);
});

test("all mainnet unsafe API methods inherit consent except exact operational routes", () => {
  for (const path of ["/api/mesh", "/api/v1/tx/mint", "/api/proposals", "/api/proposals/auth/nonce", "/api/proposals/123/sign", "/api/proposals/123/submit", "/api/stt/sync/other", "/api/beta-consent/other"]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(requiresBetaConsent(method, path, "mainnet"), true);
  }
  for (const path of ["/api/stt/sync", "/api/stt/sync/", "/api/beta-consent"]) assert.equal(requiresBetaConsent("POST", path, "mainnet"), false);
  assert.equal(requiresBetaConsent("DELETE", "/api/proposals/auth", "mainnet"), false);
  assert.equal(requiresBetaConsent("POST", "/api/proposals/auth", "mainnet"), true);
  for (const method of ["GET", "HEAD", "OPTIONS"]) assert.equal(requiresBetaConsent(method, "/api/mesh", "mainnet"), false);
  assert.equal(requiresBetaConsent("POST", "/api/mesh", "preprod"), false);
});

test("only exact legal pages bypass the browser boundary", async () => {
  const { isLegalPath } = await import("../legal");
  for (const path of ["/terms", "/terms/", "/privacy", "/legal"]) assert.equal(isLegalPath(path), true);
  for (const path of ["/terms/wallet", "/privacy-export", "/legalish", "/user"]) assert.equal(isLegalPath(path), false);
});

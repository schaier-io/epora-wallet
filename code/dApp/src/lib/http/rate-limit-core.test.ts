import assert from "node:assert/strict";
import test from "node:test";

import { clientKey, resultFromRateLimitRow } from "./rate-limit-core";

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/mesh", { headers });
}

test("PostgreSQL bucket rows allow up to the limit then return a retry hint", () => {
  const now = Date.now();
  assert.deepEqual(
    resultFromRateLimitRow({ requestCount: 2, expiresAt: new Date(now + 60_000) }, 2, now),
    { ok: true, retryAfterSeconds: 0 }
  );
  assert.deepEqual(
    resultFromRateLimitRow({ requestCount: 3, expiresAt: new Date(now + 60_000) }, 2, now),
    { ok: false, retryAfterSeconds: 60 }
  );
});

test("clientKey prefers x-real-ip over x-forwarded-for", () => {
  const request = requestWithHeaders({
    "x-real-ip": "203.0.113.9",
    "x-forwarded-for": "198.51.100.1, 192.0.2.2",
  });
  assert.equal(clientKey(request, "mesh"), "mesh:203.0.113.9");
});

test("clientKey takes the RIGHTMOST x-forwarded-for hop, not the client-claimed first hop", () => {
  const request = requestWithHeaders({
    "x-forwarded-for": "6.6.6.6, 198.51.100.7",
  });
  assert.equal(clientKey(request, "mesh"), "mesh:198.51.100.7");
});

test("clientKey collapses non-IP-shaped header junk into the shared unknown bucket", () => {
  for (const junk of ["evil", "203.0.113.9; DROP", "a".repeat(64), "", "999.999.999.999"]) {
    const request = requestWithHeaders({ "x-real-ip": junk });
    assert.equal(clientKey(request, "mesh"), "mesh:unknown", `junk: ${junk}`);
  }
});

test("clientKey accepts IPv6 and IPv4-mapped values", () => {
  for (const ip of ["2001:db8::1", "::ffff:203.0.113.9"]) {
    const request = requestWithHeaders({ "x-real-ip": ip });
    assert.equal(clientKey(request, "mesh"), `mesh:${ip}`, `ip: ${ip}`);
  }
});

test("clientKey strips an IPv4 :port suffix so a port-appending proxy keys to one bucket", () => {
  const request = requestWithHeaders({ "x-real-ip": "203.0.113.9:54321" });
  assert.equal(clientKey(request, "mesh"), "mesh:203.0.113.9");
});

test("clientKey strips a bracketed IPv6 host:port", () => {
  const request = requestWithHeaders({ "x-real-ip": "[2001:db8::1]:443" });
  assert.equal(clientKey(request, "mesh"), "mesh:2001:db8::1");
});

test("clientKey without any forwarding header falls back to unknown", () => {
  assert.equal(clientKey(requestWithHeaders({}), "mesh"), "mesh:unknown");
});

// --- trust configuration ---

function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    run();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("RATE_LIMIT_TRUST_PROXY_HEADERS=false ignores forwarding headers entirely", () => {
  withEnv({ RATE_LIMIT_TRUST_PROXY_HEADERS: "false", RATE_LIMIT_TRUSTED_PROXY_HOPS: undefined }, () => {
    const request = requestWithHeaders({
      "x-real-ip": "203.0.113.9",
      "x-forwarded-for": "198.51.100.1",
    });
    assert.equal(clientKey(request, "mesh"), "mesh:unknown");
  });
});

test("the trust knob fails closed on mistyped disable values (FALSE, 0, off, spaces)", () => {
  for (const value of ["FALSE", " false ", "0", "no", "off", "disabled"]) {
    withEnv({ RATE_LIMIT_TRUST_PROXY_HEADERS: value, RATE_LIMIT_TRUSTED_PROXY_HOPS: undefined }, () => {
      const request = requestWithHeaders({ "x-real-ip": "203.0.113.9" });
      assert.equal(clientKey(request, "mesh"), "mesh:unknown", `value: "${value}"`);
    });
  }
});

test("RATE_LIMIT_TRUSTED_PROXY_HOPS makes X-Forwarded-For authoritative over a spoofed X-Real-IP", () => {
  withEnv({ RATE_LIMIT_TRUSTED_PROXY_HOPS: "1", RATE_LIMIT_TRUST_PROXY_HEADERS: undefined }, () => {
    const request = requestWithHeaders({
      "x-real-ip": "6.6.6.6", // attacker-supplied, must be ignored
      "x-forwarded-for": "203.0.113.9, 198.51.100.7", // rightmost = edge-appended client
    });
    assert.equal(clientKey(request, "mesh"), "mesh:198.51.100.7");
  });
});

test("RATE_LIMIT_TRUSTED_PROXY_HOPS=2 skips a client-injected XFF prefix in a two-proxy chain", () => {
  withEnv({ RATE_LIMIT_TRUSTED_PROXY_HOPS: "2", RATE_LIMIT_TRUST_PROXY_HEADERS: undefined }, () => {
    // Attacker prepends "6.6.6.6"; the two trusted proxies then append the real
    // client and the outer proxy. With 2 trusted hops the client sits at
    // index len-2, so the forged left entry is skipped.
    const request = requestWithHeaders({
      "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1",
    });
    assert.equal(clientKey(request, "mesh"), "mesh:203.0.113.9");
  });
});

test("with hops set, a short/missing XFF fails closed to unknown, never falling back to spoofable X-Real-IP", () => {
  withEnv({ RATE_LIMIT_TRUSTED_PROXY_HOPS: "2", RATE_LIMIT_TRUST_PROXY_HEADERS: undefined }, () => {
    // Attacker sets X-Real-IP and sends a 1-entry XFF (fewer than 2 hops) to try
    // to force the key onto the header they control. It must collapse to unknown.
    const shortXff = requestWithHeaders({
      "x-real-ip": "6.6.6.6",
      "x-forwarded-for": "203.0.113.9",
    });
    assert.equal(clientKey(shortXff, "mesh"), "mesh:unknown");

    const noXff = requestWithHeaders({ "x-real-ip": "6.6.6.6" });
    assert.equal(clientKey(noXff, "mesh"), "mesh:unknown");
  });
});

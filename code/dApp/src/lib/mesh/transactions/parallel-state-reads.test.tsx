// @vitest-environment node
import { expect, it } from "vitest";
import { createOfflineActionFixture } from "./offline-evaluation-action-fixture";

for (const action of ["state-update", "wallet-spend", "withdraw", "publish", "vote"] as const) {
  it(`${action} resolves state and reference inputs while protocol setup waits`, async () => {
    const fixture = await createOfflineActionFixture(action);
    let releaseSetup!: () => void;
    const setupBlocked = new Promise<void>(resolve => { releaseSetup = resolve; });
    const originalGet = fixture.fetcher.get.bind(fixture.fetcher);
    const statusCalls = new Map<string, number>();
    let referenceStarted!: () => void;
    const referenceRead = new Promise<void>(resolve => { referenceStarted = resolve; });
    const stateHash = fixture.utxos[2]!.input.txHash;
    const referenceHash = fixture.utxos[3]!.input.txHash;
    const actionReferenceHash = ["withdraw", "publish", "vote"].includes(action)
      ? fixture.utxos[4]!.input.txHash : undefined;
    fixture.fetcher.get = async path => {
      if (path.includes("epochs/latest/parameters")) await setupBlocked;
      if (path === `txs/${stateHash}/utxos` || path === `txs/${referenceHash}/utxos` ||
          path === `txs/${actionReferenceHash}/utxos`) {
        statusCalls.set(path, (statusCalls.get(path) ?? 0) + 1);
        if (path === `txs/${referenceHash}/utxos`) referenceStarted();
      }
      return originalGet(path);
    };
    const building = fixture.build();
    // Consume errors immediately even if a regression prevents the read starting.
    const settled = building.then(value => ({ value }), (error: unknown) => ({ error }));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const started = await Promise.race([
        referenceRead.then(() => true),
        new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 2_000); })
      ]);
      expect(started).toBe(true);
      expect(statusCalls.get(`txs/${stateHash}/utxos`)).toBe(1);
      expect(statusCalls.get(`txs/${referenceHash}/utxos`)).toBe(1);
      if (actionReferenceHash) expect(statusCalls.get(`txs/${actionReferenceHash}/utxos`)).toBe(1);
    } finally {
      clearTimeout(timeout);
      releaseSetup();
      const result = await settled;
      if ("error" in result) throw result.error;
    }
    // The final pass must refresh consumed status, despite early immutable reads.
    expect(statusCalls.get(`txs/${stateHash}/utxos`)).toBe(2);
    expect(statusCalls.get(`txs/${referenceHash}/utxos`)).toBe(2);
    if (actionReferenceHash) expect(statusCalls.get(`txs/${actionReferenceHash}/utxos`)).toBe(2);
  }, 30_000);

  it(`${action} rejects state spent before the final pass`, async () => {
    const fixture = await createOfflineActionFixture(action);
    const stateHash = fixture.utxos[2]!.input.txHash;
    const originalGet = fixture.fetcher.get.bind(fixture.fetcher);
    let stateChecks = 0;
    fixture.fetcher.get = async path => {
      if (path === `txs/${stateHash}/utxos` && ++stateChecks === 2) {
        return { outputs: [{ output_index: 0, consumed_by_tx: "ff".repeat(32) }] };
      }
      return originalGet(path);
    };
    await expect(fixture.build()).rejects.toThrow(/spent/i);
    expect(stateChecks).toBe(2);
  }, 30_000);
}

for (const action of ["withdraw", "publish", "vote"] as const) {
  it(`configured ${action} reference avoids an unused change-address scan`, async () => {
    const fixture = await createOfflineActionFixture(action);
    let addressReads = 0;
    const originalAddressRead = fixture.fetcher.fetchAddressUTxOs.bind(fixture.fetcher);
    fixture.fetcher.fetchAddressUTxOs = async address => {
      addressReads++;
      return originalAddressRead(address);
    };
    await fixture.build();
    expect(addressReads).toBe(0);
  });
}

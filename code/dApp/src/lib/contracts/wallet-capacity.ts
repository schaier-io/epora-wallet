export type WalletRecord = {
  wallets: readonly string[];
};

export function countWalletEntries(records: readonly WalletRecord[]): number {
  return records.reduce((total, record) => total + record.wallets.length, 0);
}

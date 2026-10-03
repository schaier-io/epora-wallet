import { CARDANO_NETWORK } from "@/lib/cardano-network";

export type DepositReceiptOwner = { address: string; network: number; walletUnit: string };
export type DepositReceipt = { txHash: string; submittedAt: number };
export const DEPOSIT_RECEIPT_EVENT = "epora:deposit-receipt";

export function depositReceiptKey(owner: DepositReceiptOwner) {
  return `epora:${CARDANO_NETWORK}:deposit-receipt:v1:${JSON.stringify([owner.address, owner.network, owner.walletUnit])}`;
}

/** Only accepted hashes are stored. Prepared transactions and signatures stay in memory. */
export function readDepositReceipt(owner: DepositReceiptOwner): DepositReceipt | null {
  try {
    const raw = localStorage.getItem(depositReceiptKey(owner));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<DepositReceipt> | null;
    return value && typeof value.txHash === "string" && /^[0-9a-f]{64}$/i.test(value.txHash) &&
      typeof value.submittedAt === "number" && Number.isSafeInteger(value.submittedAt) && value.submittedAt >= 0
      ? { txHash: value.txHash, submittedAt: value.submittedAt } : null;
  } catch { return null; }
}

export function saveDepositReceipt(owner: DepositReceiptOwner, txHash: string): void {
  if (!/^[0-9a-f]{64}$/i.test(txHash)) return;
  try {
    localStorage.setItem(depositReceiptKey(owner), JSON.stringify({ txHash, submittedAt: Date.now() }));
    window.dispatchEvent(new Event(DEPOSIT_RECEIPT_EVENT));
  } catch { /* The current page still shows the accepted receipt if storage is unavailable. */ }
}

export function acknowledgeDepositReceipt(owner: DepositReceiptOwner, txHash: string | null): void {
  if (!txHash || readDepositReceipt(owner)?.txHash !== txHash) return;
  try {
    localStorage.removeItem(depositReceiptKey(owner));
    window.dispatchEvent(new Event(DEPOSIT_RECEIPT_EVENT));
  } catch { /* Never erase another scope or newer receipt. */ }
}

import { safeStringify } from "@/components/user/workspace/helpers";
import type { PayoutTransfer } from "@/lib/types/contracts";

export type PreparedStreamingPaymentPayout = {
  extraTransfers: PayoutTransfer[];
  identity: string;
};

export function prepareStreamingPaymentPayout(
  transfers: PayoutTransfer[]
): PreparedStreamingPaymentPayout {
  const extraTransfers = transfers.map((transfer) => ({
    address: transfer.address,
    amount: transfer.amount.map((asset) => ({ ...asset })),
    ...(transfer.inlineDatum
      ? { inlineDatum: structuredClone(transfer.inlineDatum) }
      : {})
  }));

  return {
    extraTransfers,
    identity: safeStringify(extraTransfers)
  };
}

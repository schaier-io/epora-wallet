import "server-only";
import { getPrisma } from "@/lib/prisma";
import {
  recordSignerRegistration,
  registeredWalletSignerKeyHashes
} from "./signer-registration";

export async function rememberSignerSignIn(paymentKeyHash: string): Promise<void> {
  return recordSignerRegistration(getPrisma(), paymentKeyHash);
}

export async function listRegisteredWalletSigners(walletUnit: string): Promise<string[]> {
  return registeredWalletSignerKeyHashes(getPrisma(), walletUnit);
}

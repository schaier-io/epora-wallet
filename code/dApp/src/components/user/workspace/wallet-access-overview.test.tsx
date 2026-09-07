import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { WalletAccessOverview } from "./wallet-access-overview";
import { createDefaultStateForm } from "@/lib/contracts/state-form";

const KEY = "ab".repeat(28);
const messages = {
  ComponentsUserWorkspaceWalletAccessOverview: {
    yourAccess: "Your access",
    owner: "Owner",
    ownerApproval: "Owner approval. No co-signer threshold is required.",
    coSigner: "Co-signer",
    spender: "Spender",
    proofOfLife: "Proof-of-life renewer",
    recoveryContact: "Recovery contact",
    listedUser: "Listed user",
    readOnly: "Read-only",
    managePermission: "Manage wallet rules and people.",
    sendPermission: "Send through your available authorization paths.",
    renewPermission: "Renew the proof of life.",
    recoveryPermission: "Recover funds after access unlocks.",
    noActivePermissions: "No active permissions are assigned to this key.",
    connectForPermissions: "Connect a wallet to see its roles and permissions.",
    permissionDetails: "Permission details",
    permissionDetailsDescription: "Approval power, spending limits, proof of life, and recovery access.",
    approvalPower: "Approval power",
    powerValueThreshold: "{power} power. Wallet threshold: {threshold}.",
    notGranted: "Not granted",
    dailyAllowance: "Daily allowance",
    allowancePerDay: "{allowance} per day",
    proofOfLifeRights: "Proof-of-life rights",
    canRenewProofOfLife: "Can renew the proof of life.",
    cannotRenewProofOfLife: "Cannot renew the proof of life.",
    recoveryAccess: "Recovery access",
    recoveryValueAfter: "Share weight {weight}. Available after {date}.",
    recoveryValueNow: "Share weight {weight}. Available when recovery opens."
  }
};

function renderOverview(state = createDefaultStateForm()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WalletAccessOverview state={state} paymentKeyHash={KEY} />
    </NextIntlClientProvider>
  );
}

describe("WalletAccessOverview", () => {
  it("shows actual roles and keeps exact limits in the disclosure", () => {
    const state = createDefaultStateForm();
    state.users = [{
      id: "0",
      wallets: [KEY],
      perDayAllowance: [{ policyId: "", assetName: "", amount: "12" }],
      remainingAllowance: [],
      nextAllowanceReset: "0",
      canRenewProofOfLife: false,
      multiSigPowerMode: "none",
      multiSigPower: "",
      isAdmin: false,
      preset: "limited-withdrawal"
    }];

    renderOverview(state);

    expect(screen.getByText("Spender")).toBeInTheDocument();
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
    expect(screen.getByText("Send through your available authorization paths.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Permission details/i }));
    expect(screen.getByText("12 ₳ per day")).toBeInTheDocument();
    expect(screen.getByText("Cannot renew the proof of life.")).toBeInTheDocument();
  });

  it("does not call a listed user without an allowance a spender", () => {
    const state = createDefaultStateForm();
    state.users = [{
      id: "0",
      wallets: [KEY],
      perDayAllowance: [],
      remainingAllowance: [],
      nextAllowanceReset: "0",
      canRenewProofOfLife: false,
      multiSigPowerMode: "none",
      multiSigPower: "",
      isAdmin: false,
      preset: "custom"
    }];

    renderOverview(state);

    expect(screen.getByText("Listed user")).toBeInTheDocument();
    expect(screen.queryByText("Spender")).not.toBeInTheDocument();
    expect(screen.getByText("No active permissions are assigned to this key.")).toBeInTheDocument();
  });

  it("describes an owner's direct approval power", () => {
    const state = createDefaultStateForm();
    state.users = [{
      id: "0",
      wallets: [KEY],
      perDayAllowance: [],
      remainingAllowance: [],
      nextAllowanceReset: "0",
      canRenewProofOfLife: true,
      multiSigPowerMode: "none",
      multiSigPower: "",
      isAdmin: true,
      preset: "admin"
    }];

    renderOverview(state);
    fireEvent.click(screen.getByRole("button", { name: /Permission details/i }));

    expect(screen.getByText("Owner approval. No co-signer threshold is required.")).toBeInTheDocument();
  });
});

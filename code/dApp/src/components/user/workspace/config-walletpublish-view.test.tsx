import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  rewardAddress: "stake_test17qexample" as string | null,
  certificateJson: "{}",
  setCertificateJson: vi.fn()
}));

vi.mock(
  "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms",
  async (importOriginal) => {
    const { atom } = await import("jotai");
    return {
      ...(await importOriginal<Record<string, unknown>>()),
      walletRewardAddressAtom: atom(() => holder.rewardAddress)
    };
  }
);

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => ({ activeFieldErrors: {} })
}));

vi.mock("@/components/user/workspace/forms/use-publish-form", () => ({
  usePublishForm: () => ({
    publishCertificateJson: holder.certificateJson,
    setPublishCertificateJson: holder.setCertificateJson
  })
}));

vi.mock("@/components/user/workspace/forms/use-stt-spend-form", () => ({
  useSttSpendForm: () => ({ walletOperatorPath: "admin", setWalletOperatorPath: vi.fn() })
}));

const { WalletPublishConfigView } = await import(
  "@/components/user/workspace/config-walletpublish-view"
);

function renderView({ rewardAddress = "stake_test17qexample" as string | null } = {}) {
  holder.rewardAddress = rewardAddress;
  holder.setCertificateJson = vi.fn();
  return render(
    <Provider store={createStore()}>
      <WalletPublishConfigView />
    </Provider>
  );
}

describe("signing path selection", () => {
  it("leaves approval routing to the review rail", () => {
    renderView();

    expect(screen.queryByText("Who approves this certificate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sign as")).not.toBeInTheDocument();
  });

  /**
   * `lib/mesh/transactions/wallet-governance.ts:125-136` pushes the certificate onto THIS
   * transaction's `certificates` array. Nothing is held back for a later action.
   */
  it("no longer says the certificate waits for a later action", () => {
    renderView();

    expect(screen.queryByText(/next owner action/)).not.toBeInTheDocument();
  });
});

/**
 * Mesh's `CertificateType` union (`@meshsdk/common` `index.d.ts:321-380`) has no
 * `StakeRegistration` and no `VoteDeleg`, and `toCardanoCert`
 * (`@meshsdk/core-cst` `index.js:73354`) has no default branch, so both old templates
 * resolved to `undefined` and could never build a transaction.
 */
describe("certificate templates", () => {
  it("writes a vote delegation Mesh can serialize", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Always abstain" }));

    expect(holder.setCertificateJson).toHaveBeenCalledTimes(1);
    const written: unknown = JSON.parse(holder.setCertificateJson.mock.calls[0][0] as string);
    expect(written).toEqual({
      type: "VoteDelegation",
      stakeKeyAddress: "stake_test17qexample",
      drep: { alwaysAbstain: null }
    });
  });

  it("writes a stake registration Mesh can serialize", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Stake registration" }));

    expect(holder.setCertificateJson).toHaveBeenCalledTimes(1);
    const written: unknown = JSON.parse(holder.setCertificateJson.mock.calls[0][0] as string);
    expect(written).toEqual({
      type: "RegisterStake",
      stakeKeyAddress: "stake_test17qexample"
    });
  });

  it("turns both templates off when the staking address is unknown", () => {
    renderView({ rewardAddress: null });

    expect(screen.getByRole("button", { name: "Always abstain" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stake registration" })).toBeDisabled();
    expect(
      screen.getByText(/The templates need this wallet's staking address/)
    ).toBeInTheDocument();
  });

  it("leaves Clear working so the box can be emptied by hand", () => {
    renderView({ rewardAddress: null });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(holder.setCertificateJson).toHaveBeenCalledWith("{}");
  });
});

describe("template explanation", () => {
  it("explains both templates in text every reader can see", () => {
    renderView();

    expect(
      screen.getByText(/Always abstain hands this wallet's voting power/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Stake registration registers the wallet's staking address/)
    ).toBeInTheDocument();
  });

  it("keeps no explanation hidden in a title tooltip", () => {
    renderView();

    expect(
      screen.getByRole("button", { name: "Always abstain" })
    ).not.toHaveAttribute("title");
    expect(
      screen.getByRole("button", { name: "Stake registration" })
    ).not.toHaveAttribute("title");
  });

  it("puts the explanation before the box it describes", () => {
    const { container } = renderView();

    const explanation = screen.getByText(/Always abstain hands this wallet's voting power/);
    const textarea = container.querySelector("#userPublishCertificateJson")!;
    expect(
      explanation.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("drops mobile-only wording and the arbitrary type size", () => {
    renderView();

    expect(screen.queryByText(/^Tap a template above/)).not.toBeInTheDocument();
    for (const name of ["Always abstain", "Stake registration", "Clear"]) {
      expect(screen.getByRole("button", { name }).className).not.toContain("text-[11px]");
    }
  });
});

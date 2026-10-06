"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";

import { walletRewardAddressAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { usePublishForm } from "@/components/user/workspace/forms/use-publish-form";
import {
  buildVoteDelegationJson,
  readVoteDelegationJson,
  type DelegateChoice,
  type StakeRegistration
} from "@/lib/governance/vote-delegation";
import { stakeAccountQueryOptions } from "@/lib/query/accounts";
import { protocolParametersQueryOptions } from "@/lib/query/chain";

/**
 * State for the voting-delegate form. The certificate is a `VoteDelegation`, or a
 * `VoteRegistrationAndDelegation` when the wallet's stake address is not registered yet,
 * so the chain's registration state decides the type and the protocol's key deposit its
 * `coin`. Until both are known nothing is written: a guess would build a certificate the
 * ledger rejects.
 */
export function useVotingDelegate() {
  // `wallet.wallet.{spend,withdraw,publish}` are one validator with one hash
  // (`lib/contracts/blueprint.ts:96-99`), so the wallet's own reward address is the
  // credential the publish witness covers.
  const stakeAddress = useAtomValue(walletRewardAddressAtom);
  const { publishCertificateJson, setPublishCertificateJson } = usePublishForm();
  const saved = readVoteDelegationJson(publishCertificateJson);

  const account = useQuery({ ...stakeAccountQueryOptions(stakeAddress ?? ""), enabled: !!stakeAddress });
  const needsDeposit = account.data?.registered === false;
  const protocol = useQuery({ ...protocolParametersQueryOptions(), enabled: needsDeposit });
  const depositLovelace = protocol.data?.keyDeposit ?? null;
  const registration: StakeRegistration | null = !account.data ? null
    : account.data.registered ? { registered: true }
    : depositLovelace !== null ? { registered: false, depositLovelace }
    : null;

  const choose = (choice: DelegateChoice) => {
    if (!stakeAddress || !registration) return;
    setPublishCertificateJson(buildVoteDelegationJson(stakeAddress, choice, registration));
  };

  // A saved choice follows the chain: the address may register (or a draft may come from
  // another wallet) between the pick and the build, and the certificate type must follow.
  const registered = registration?.registered ?? null;
  useEffect(() => {
    const current = readVoteDelegationJson(publishCertificateJson);
    if (!current || !stakeAddress || registered === null) return;
    if (registered === false && depositLovelace === null) return;
    const next = buildVoteDelegationJson(
      stakeAddress,
      current.choice,
      registered ? { registered: true } : { registered: false, depositLovelace: depositLovelace! }
    );
    if (next !== publishCertificateJson) setPublishCertificateJson(next);
  }, [publishCertificateJson, stakeAddress, registered, depositLovelace, setPublishCertificateJson]);

  // The route answers 400 for an address on another network; retrying cannot fix that.
  const accountInvalid = (account.error as { status?: number } | null)?.status === 400;
  const accountFailed = !accountInvalid && (account.isError || protocol.isError);
  return {
    stakeAddress,
    saved,
    account: account.data ?? null,
    accountLoading: !!stakeAddress && registration === null && !accountFailed && !accountInvalid,
    accountFailed,
    accountInvalid,
    retryAccount: () => {
      void account.refetch();
      if (protocol.isError) void protocol.refetch();
    },
    depositLovelace,
    ready: registration !== null,
    choose,
    clear: () => setPublishCertificateJson("{}")
  };
}

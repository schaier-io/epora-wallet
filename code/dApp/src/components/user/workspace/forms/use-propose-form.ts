"use client";

import { useAtom } from "jotai";
import { proposalJsonAtom, proposalSttInputHashAtom, proposalSttInputIndexAtom, proposalSttStateFormAtom, proposalZeroAdminConfirmedAtom, proposalSttAssetsAtom } from "@/components/user/workspace/atoms/forms/propose-form.atoms";

/**
 * Form state for the wallet-propose (governance proposal) action and the STT context it spends.
 */
export function useProposeForm() {
  const [proposalJson, setProposalJson] = useAtom(proposalJsonAtom);
  const [proposalSttInputHash, setProposalSttInputHash] = useAtom(proposalSttInputHashAtom);
  const [proposalSttInputIndex, setProposalSttInputIndex] = useAtom(proposalSttInputIndexAtom);
  const [proposalSttStateForm, setProposalSttStateForm] = useAtom(proposalSttStateFormAtom);
  const [proposalZeroAdminConfirmed, setProposalZeroAdminConfirmed] = useAtom(proposalZeroAdminConfirmedAtom);
  const [proposalSttAssets, setProposalSttAssets] = useAtom(proposalSttAssetsAtom);

  return {
    proposalJson,
    setProposalJson,
    proposalSttInputHash,
    setProposalSttInputHash,
    proposalSttInputIndex,
    setProposalSttInputIndex,
    proposalSttStateForm,
    setProposalSttStateForm,
    proposalZeroAdminConfirmed,
    setProposalZeroAdminConfirmed,
    proposalSttAssets,
    setProposalSttAssets
  };
}

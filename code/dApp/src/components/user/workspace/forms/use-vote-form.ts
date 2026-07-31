"use client";

import { useAtom } from "jotai";
import { voteJsonAtom, voteSttInputHashAtom, voteSttInputIndexAtom, voteSttStateFormAtom, voteZeroAdminConfirmedAtom, voteSttAssetsAtom } from "@/components/user/workspace/atoms/forms/vote-form.atoms";

/**
 * Form state for the wallet-vote (governance vote) action and the STT context it spends.
 */
export function useVoteForm() {
  const [voteJson, setVoteJson] = useAtom(voteJsonAtom);
  const [voteSttInputHash, setVoteSttInputHash] = useAtom(voteSttInputHashAtom);
  const [voteSttInputIndex, setVoteSttInputIndex] = useAtom(voteSttInputIndexAtom);
  const [voteSttStateForm, setVoteSttStateForm] = useAtom(voteSttStateFormAtom);
  const [voteZeroAdminConfirmed, setVoteZeroAdminConfirmed] = useAtom(voteZeroAdminConfirmedAtom);
  const [voteSttAssets, setVoteSttAssets] = useAtom(voteSttAssetsAtom);

  return {
    voteJson,
    setVoteJson,
    voteSttInputHash,
    setVoteSttInputHash,
    voteSttInputIndex,
    setVoteSttInputIndex,
    voteSttStateForm,
    setVoteSttStateForm,
    voteZeroAdminConfirmed,
    setVoteZeroAdminConfirmed,
    voteSttAssets,
    setVoteSttAssets
  };
}

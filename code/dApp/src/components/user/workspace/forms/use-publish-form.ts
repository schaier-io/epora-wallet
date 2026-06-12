"use client";

import { useAtom } from "jotai";
import { publishCertificateJsonAtom, publishSttInputHashAtom, publishSttInputIndexAtom, publishSttStateFormAtom, publishZeroAdminConfirmedAtom, publishSttAssetsAtom } from "@/components/user/workspace/atoms/forms/publish-form.atoms";

/**
 * Form state for the wallet-publish (certificate) action and the STT context it spends.
 */
export function usePublishForm() {
  const [publishCertificateJson, setPublishCertificateJson] = useAtom(publishCertificateJsonAtom);
  const [publishSttInputHash, setPublishSttInputHash] = useAtom(publishSttInputHashAtom);
  const [publishSttInputIndex, setPublishSttInputIndex] = useAtom(publishSttInputIndexAtom);
  const [publishSttStateForm, setPublishSttStateForm] = useAtom(publishSttStateFormAtom);
  const [publishZeroAdminConfirmed, setPublishZeroAdminConfirmed] = useAtom(publishZeroAdminConfirmedAtom);
  const [publishSttAssets, setPublishSttAssets] = useAtom(publishSttAssetsAtom);

  return {
    publishCertificateJson,
    setPublishCertificateJson,
    publishSttInputHash,
    setPublishSttInputHash,
    publishSttInputIndex,
    setPublishSttInputIndex,
    publishSttStateForm,
    setPublishSttStateForm,
    publishZeroAdminConfirmed,
    setPublishZeroAdminConfirmed,
    publishSttAssets,
    setPublishSttAssets
  };
}

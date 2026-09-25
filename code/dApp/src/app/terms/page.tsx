import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/legal-document";

export async function generateMetadata() {
  const t = await getTranslations("LegalPages");
  return { title: t("terms"), alternates: { canonical: "/terms" } };
}

export default function Page() {
  return <main id="main"><LegalDocument kind="terms" /></main>;
}

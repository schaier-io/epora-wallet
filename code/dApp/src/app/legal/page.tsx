import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/legal-document";

export async function generateMetadata() {
  const t = await getTranslations("LegalPages");
  return { title: t("legal"), alternates: { canonical: "/legal" } };
}

export default function Page() {
  return <main id="main"><LegalDocument kind="legal" /></main>;
}

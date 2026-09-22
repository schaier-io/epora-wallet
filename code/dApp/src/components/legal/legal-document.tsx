import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LEGAL_OPERATOR, LEGAL_VERSION } from "@/lib/legal";

const SECTIONS = {
  legal: [],
  terms: ["termsBeta", "termsLoss", "termsControl", "termsResponsibilities", "termsService", "termsAdvice", "termsWarranty", "termsPrivacy", "termsContact"],
  privacy: ["privacyData", "privacyKeys", "privacyPurposes", "privacyStorage", "privacyDiagnostics", "privacyRecipients", "privacyTransfers", "privacyRetention", "privacyRights", "privacyChanges"]
} as const;

export type LegalDocumentKind = keyof typeof SECTIONS;

export async function LegalDocument({ kind }: { kind: LegalDocumentKind }) {
  const t = await getTranslations("LegalPages");
  return (
    <article className="container max-w-3xl space-y-8 py-10 sm:py-16">
      <nav aria-label={t("navigation")} className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        {(["legal", "terms", "privacy"] as const).map((document) => (
          <Link key={document} href={`/${document}`} aria-current={kind === document ? "page" : undefined}
            className="rounded-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t(document)}
          </Link>
        ))}
        <Link href="/" className="rounded-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("back")}
        </Link>
      </nav>
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t(kind)}</h1>
        <p className="text-sm text-muted-foreground">{t("version", { version: LEGAL_VERSION })}</p>
        <p className="leading-relaxed">{t(`${kind}Intro`)}</p>
      </header>
      {SECTIONS[kind].map((section) => (
        <section key={section} className="space-y-3" aria-labelledby={`legal-${section}`}>
          <h2 id={`legal-${section}`} className="text-xl font-semibold">{t(`${section}Title`)}</h2>
          <p className="leading-relaxed text-muted-foreground">{t(`${section}Body`)}</p>
        </section>
      ))}
      <section className="space-y-3 border-t border-border pt-6" aria-labelledby="legal-operator">
        <h2 id="legal-operator" className="text-xl font-semibold">{t("operator")}</h2>
        <p className="font-medium">{LEGAL_OPERATOR.name}</p>
        <p>{t("registration", { entityId: LEGAL_OPERATOR.entityId })}</p>
        <address className="space-y-3 not-italic text-muted-foreground">
          <p>{t("address")}: {LEGAL_OPERATOR.address}</p>
          <p>{t("contact")}: <a href={`mailto:${LEGAL_OPERATOR.email}`} className="rounded-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{LEGAL_OPERATOR.email}</a></p>
        </address>
      </section>
    </article>
  );
}

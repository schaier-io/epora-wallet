import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { SttReferenceSetup } from "@/components/setup/stt-reference-setup";
import { ScopedClientIntlProvider } from "@/i18n/scoped-client-provider";
import { resolveSharedSttReferenceServer } from "@/lib/mesh/shared-stt-reference-server";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await getTranslations("AppSetupPage");
  return {
    title: i18n("title"),
    description: i18n("description"),
    robots: { index: false, follow: false }
  };
}

export default async function SetupPage() {
  let initialStore = null;
  try {
    initialStore = await resolveSharedSttReferenceServer();
  } catch {
    // The client keeps the setup route usable when the provider read is unavailable.
  }

  if (initialStore?.status === "ready") {
    return redirect("/");
  }

  return (
    <main className="page-shell flex flex-1 flex-col">
      <ScopedClientIntlProvider prefixes={["ComponentsSetup"]}>
        <div className="container flex flex-1 items-center justify-center py-8 sm:py-12">
          <SttReferenceSetup initialStore={initialStore} />
        </div>
      </ScopedClientIntlProvider>
    </main>
  );
}

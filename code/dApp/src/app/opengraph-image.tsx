import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";

export const alt = "Epora Wallet: a non-custodial Cardano wallet you share across owners and spenders, with on-chain spending limits, multisig, and key recovery once a proof of life expires.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Issue #409: draw the canonical gradient mark from public/logo-mark.svg instead of
// hand-copied flat-color paths, and scale it up from the old 92x104 px.
const LOGO_MARK_FILE = "logo-mark.svg";
const LOGO_HEIGHT = 200;
// The mark's viewBox is 834x938.
const LOGO_WIDTH = Math.round(LOGO_HEIGHT * (834 / 938));

// The path arguments stay compile-time constants, which is what keeps Turbopack
// from tracing the whole project for this dynamic read. Resolves against the app
// directory: every deploy flow (Vercel, `pnpm start`) runs with cwd inside it.
let logoMarkSvg: string | undefined;
function readLogoMarkSvg(): string {
  logoMarkSvg ??= (() => {
    let dir = process.cwd();
    while (true) {
      const candidate = path.join(dir, "public", LOGO_MARK_FILE);
      if (existsSync(candidate)) return readFileSync(candidate, "utf8");
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    throw new Error(`public/${LOGO_MARK_FILE} not found from: ${process.cwd()}`);
  })();
  return logoMarkSvg;
}

export default async function OpengraphImage() {
  const i18n = await getTranslations("AppOpengraphImage");
  const logoSrc = `data:image/svg+xml;base64,${Buffer.from(readLogoMarkSvg(), "utf8").toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background:
            "linear-gradient(135deg, #001331 0%, #0F2952 45%, #194667 100%)",
          color: "#ECFEFD",
          padding: "72px",
          fontFamily: "Inter, system-ui, sans-serif",
          position: "relative",
          overflow: "hidden"
        }}
      >
        {/* aurora blobs */}
        <div
          style={{
            position: "absolute",
            top: "-180px",
            right: "-160px",
            width: "520px",
            height: "520px",
            borderRadius: "9999px",
            background: "radial-gradient(circle, rgba(55,212,203,0.45) 0%, rgba(55,212,203,0) 70%)"
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-220px",
            left: "-180px",
            width: "560px",
            height: "560px",
            borderRadius: "9999px",
            background: "radial-gradient(circle, rgba(31,82,124,0.55) 0%, rgba(31,82,124,0) 70%)"
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            position: "relative"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <img src={logoSrc} width={LOGO_WIDTH} height={LOGO_HEIGHT} alt="" />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={{ fontSize: 28, color: "#7DD3CB", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                {i18n("cardanoPreprod")}
              </span>
              <span style={{ fontSize: 56, fontWeight: 700, marginTop: 12 }}>
                {i18n("eporaWallet")}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <span style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.15, maxWidth: 980 }}>
              {i18n("loseYourKeysNotYourAda")}
            </span>
            <span style={{ fontSize: 26, color: "#A5C9C3", maxWidth: 960 }}>
              {i18n("shareAWalletOnCardanoSetOnChain")}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 22, color: "#9CB6C9" }}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                border: "1px solid rgba(55,212,203,0.35)",
                borderRadius: 999,
                background: "rgba(55,212,203,0.08)",
                color: "#7DD3CB"
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 9999,
                  background: "#37D4CB"
                }}
              />
              preprod.cardanoscan.io
            </span>
            <span>{i18n("catalystProposalSelfHostable")}</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

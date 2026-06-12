import { ImageResponse } from "next/og";

export const alt = "Epora Wallet — a non-custodial Cardano wallet you share across owners and spenders, with on-chain spending limits, multisig, and key recovery if a signer is lost.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
            <svg width="92" height="104" viewBox="0 0 834 938" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M349.083,46.5l-265.292,120.875c-41.833,13.208 -71.792,49.25 -71.792,95.917l-0,196.375c0,140.042 67.125,248.542 166.292,330.875c29.25,24 59.833,54.458 118.125,57.458c95.375,5 174.167,-79.292 174.167,-185.042l0,-62.875c0,-45.042 18.75,-88.25 50.625,-115.417c4.167,1.917 8.917,3.083 13.833,3.083c20.917,0 32.917,-17.958 31.125,-34.792c-1.667,-15.625 -14.542,-27.75 -31.125,-27.75c-19.958,0 -31.25,16.958 -31.875,31.292c-39.458,29.375 -66.167,71.167 -66.167,138.375l0,68.083c0,78.375 -49.75,156.75 -135.208,155.333c-41.625,-0.75 -63.542,-17.083 -90.625,-38.875c-81.458,-66.667 -162.875,-158.542 -162.875,-319.792l-0,-196.333c0,-29.375 19.042,-53.958 47.458,-63.5l215.375,-103.375c11.625,-18.958 18.5,-30.125 37.958,-49.917Z"
                fill="#22527F"
              />
              <path
                d="M289.5,158.042l-176.667,80.375c-16.333,1.917 -21.125,14.833 -21.125,25.417l0,194.542c0,111.708 53.583,212.333 167.083,299.083c18.333,13.542 33.667,14.25 50.292,13.542c47.958,-3.25 82.167,-54 82.167,-108.042l0,-86.208c0,-100.583 48.833,-201.708 144.25,-281.458l26.542,-23.542c4.375,1.458 8.417,2.167 13.458,2.167c23.583,0 33.583,-20.667 32.958,-32.958c-1,-17.167 -13.917,-31.625 -32,-31.625c-19.75,0 -31.083,16.458 -31.583,31.958c-71.5,54.458 -148.5,124.167 -175.167,259.25c-9.667,-16.875 -21.708,-28.958 -40.917,-45.292c-0.375,-18.125 -13.292,-30.042 -29.833,-30.042c-20.917,0 -31.625,17.333 -30.542,31.125c1.25,16.833 13.708,29.625 30.542,29.625c4.625,0 9.042,-1.125 13,-2.958c30.625,24.833 47.25,59.208 47.25,110.208l0,66.875c0,38.708 -21.667,80.375 -57.5,80.375c-13.958,0 -26.333,-9.167 -34.708,-16.042c-83.208,-62.667 -143.625,-142.417 -143.625,-266.042l0,-190.333c51.292,-18.208 113.875,-46.75 161.125,-71.25c1.417,-13.792 2.125,-25.208 5,-38.75Z"
                fill="#37D4CB"
              />
              <path
                d="M416.667,18.667c-52.25,47.208 -109.542,113.458 -109.542,198.667c0,57.083 29.333,106.542 48.75,131.542c9.917,13.333 20.208,28.667 26.458,42.417c5.958,-16.875 19.458,-41 44.833,-70.792l0,-90.292c12.583,-7.833 17.458,-23.125 13.292,-36.917c-4.833,-16.292 -20.333,-24.708 -33.875,-22.625c-16.333,2.417 -25.25,15.917 -23.875,31.458c1.083,10.833 7.625,21.083 16.5,26.75l0,125.958c-32.833,-39.333 -60.417,-79.792 -60.417,-137.5c0,-60.917 36.292,-114.875 77.875,-161.542c45.333,46.875 76.625,98.083 70.25,181.833l-2.083,21.208l38,-29.167c9.292,-77.417 -39.125,-153.792 -106.167,-211Z"
                fill="#C7E7B6"
              />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={{ fontSize: 28, color: "#7DD3CB", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                Cardano · Preprod
              </span>
              <span style={{ fontSize: 56, fontWeight: 700, marginTop: 12 }}>
                Epora Wallet
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <span style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.15, maxWidth: 980 }}>
              Lose your keys, not your ADA
            </span>
            <span style={{ fontSize: 26, color: "#A5C9C3", maxWidth: 960 }}>
              Share a wallet on Cardano. Set on-chain limits. Recover lost keys.
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
            <span>· catalyst proposal · self-hostable</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

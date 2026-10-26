import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og-fonts";

export const alt = "Lovewall: open-source testimonials";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEART =
  "M12 20.4c-.3 0-.6-.1-.8-.3C6.3 16 3.2 13.1 3.2 9.4 3.2 6.6 5.3 4.5 8 4.5c1.6 0 3 .7 4 2 1-1.3 2.4-2 4-2 2.7 0 4.8 2.1 4.8 4.9 0 3.7-3.1 6.6-8 10.7-.2.2-.5.3-.8.3z";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#f4f2ee",
        padding: "72px 84px",
        fontFamily: "Geist",
        color: "#1c1c1b",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width="48" height="48" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="8.5" fill="#1c1c1b" />
          <path transform="translate(4 4.4)" d={HEART} fill="#ffffff" />
        </svg>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>Lovewall</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 500, letterSpacing: -3.2, lineHeight: 1.05 }}>Testimonials,</div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 500, letterSpacing: -3.2, lineHeight: 1.05 }}>open source.</div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 30, color: "#64635f" }}>Open source. Free to self-host, every feature.</div>
      </div>
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "14px 20px",
          borderRadius: 12,
          border: "1px solid #e6e5e1",
          background: "#ffffff",
          fontSize: 22,
          color: "#64635f",
        }}
      >
        {'<div data-lovewall="…"></div>'}
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  );
}

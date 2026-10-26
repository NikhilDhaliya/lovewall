import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og-fonts";
import { getWallPayload } from "@/lib/data/public";
import { cssColor } from "@/lib/escape";

export const alt = "Wall of love";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

const STAR = "M12 2.6l2.83 6.08 6.67.78-4.93 4.55 1.31 6.58L12 17.3l-5.88 3.29 1.31-6.58L2.5 9.46l6.67-.78z";
const HEART =
  "M12 20.4c-.3 0-.6-.1-.8-.3C6.3 16 3.2 13.1 3.2 9.4 3.2 6.6 5.3 4.5 8 4.5c1.6 0 3 .7 4 2 1-1.3 2.4-2 4-2 2.7 0 4.8 2.1 4.8 4.9 0 3.7-3.1 6.6-8 10.7-.2.2-.5.3-.8.3z";

// Fetches an image into a data URL (short timeout); a missing photo falls back to the silhouette.
async function dataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(png|jpeg|webp)/.test(type)) return null;
    if (Number(res.headers.get("content-length") ?? 0) > 1_500_000) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1_500_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// The top testimonial (featured first) as a share card.
export default async function Image(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const payload = /^[0-9A-Za-z]{8,32}$/.test(id) ? await getWallPayload(id) : null;
  // No image for a widget that doesn't exist (each would be a full render, cached for a day).
  if (!payload) return new Response("Not found", { status: 404 });
  const top = payload?.items.find((t) => t.text) ?? null;
  const space = payload?.space.name ?? "Lovewall";
  const accent = cssColor(payload?.widget.config.accent, "#1d1d1f");
  const avatar = await dataUrl(top?.avatar ?? null);
  const quote = top ? (top.text.length > 210 ? `${top.text.slice(0, 207).trimEnd()}…` : top.text) : `What people say about ${space}`;
  const role = top ? [top.title, top.company].filter(Boolean).join(", ") : "";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#f4f2ee",
        padding: 56,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: "#1d1d1f", letterSpacing: -0.5 }}>{space}</div>
        <div style={{ display: "flex", fontSize: 24, color: "#6e6e73" }}>Wall of love</div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 16,
          padding: "40px 48px",
          border: "1px solid #e6e5e1",
        }}
      >
        {top?.rating ? (
          <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <svg key={i} width="34" height="34" viewBox="0 0 24 24">
                <path d={STAR} fill={i <= (top.rating ?? 0) ? accent : "#e5e5ea"} />
              </svg>
            ))}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            fontSize: quote.length > 140 ? 36 : 42,
            lineHeight: 1.3,
            color: "#1d1d1f",
            fontWeight: 500,
            letterSpacing: -0.8,
          }}
        >
          {quote}
        </div>
        {top && (
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 34 }}>
            {avatar ? (
              <img src={avatar} width={64} height={64} style={{ borderRadius: 64, objectFit: "cover" }} alt="" />
            ) : (
              <svg width="64" height="64" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="20" fill="#e5e5ea" />
                <circle cx="20" cy="16" r="6.5" fill="#c7c7cc" />
                <path
                  d="M7.5 33.5c2.4-5.6 7-8.5 12.5-8.5s10.1 2.9 12.5 8.5A19.9 19.9 0 0 1 20 40a19.9 19.9 0 0 1-12.5-6.5z"
                  fill="#c7c7cc"
                />
              </svg>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: "#1d1d1f" }}>{top.name}</div>
              {role && <div style={{ display: "flex", fontSize: 24, color: "#6e6e73" }}>{role}</div>}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg width="34" height="34" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="8.5" fill="#1d1d1f" />
          <path transform="translate(4 4.4)" d={HEART} fill="#ffffff" />
        </svg>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: "#1d1d1f" }}>Lovewall</div>
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  );
}

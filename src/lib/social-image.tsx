import "server-only";
import { ImageResponse } from "next/og";
import { z } from "zod";
import { cssColor, luminance } from "@/lib/escape";
import { ogFonts } from "@/lib/og-fonts";
import { readObject } from "@/lib/storage";
import type { Testimonial } from "@/lib/types";
import { initials } from "@/lib/widget/render";

// Testimonial images for social posts: a quote, stars, the person and an optional logo, in a few calm styles.

export const SOCIAL_SIZES = {
  square: { width: 1080, height: 1080 },
  landscape: { width: 1200, height: 675 },
  story: { width: 1080, height: 1920 },
} as const;
export const SOCIAL_STYLES = ["card", "color", "plain", "dark"] as const;

export const socialQuery = z.object({
  size: z.enum(["square", "landscape", "story"]).catch("square"),
  style: z.enum(SOCIAL_STYLES).catch("card"),
  color: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/)
    .optional()
    .catch(undefined),
  logo: z.enum(["0", "1"]).catch("1"),
  download: z.enum(["0", "1"]).catch("0"),
});
export type SocialOptions = z.infer<typeof socialQuery>;

const STAR = "M12 2.6l2.83 6.08 6.67.78-4.93 4.55 1.31 6.58L12 17.3l-5.88 3.29 1.31-6.58L2.5 9.46l6.67-.78z";

async function dataUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  const file = await readObject(key, 2_000_000);
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return null;
  return `data:${file.type};base64,${file.body.toString("base64")}`;
}

// Quote size by format and length, so short quotes are big and long ones still fit.
function quoteSize(size: SocialOptions["size"], length: number) {
  const steps = { square: [66, 54, 46, 40], landscape: [60, 50, 42, 36], story: [76, 64, 54, 48] }[size];
  const limits = { square: [110, 200, 300], landscape: [80, 140, 200], story: [150, 280, 420] }[size];
  const i = limits.findIndex((l) => length <= l);
  return steps[i === -1 ? 3 : i];
}

const MAX_CHARS = { square: 400, landscape: 240, story: 600 } as const;

export async function socialImage(
  t: Pick<Testimonial, "name" | "title" | "company" | "text" | "rating" | "avatar_key" | "company_logo_key">,
  space: { name: string; brand_color: string; logo_key: string | null },
  opts: SocialOptions,
) {
  const { width, height } = SOCIAL_SIZES[opts.size];
  const accent = cssColor(opts.color ? `#${opts.color}` : space.brand_color, "#1d1d1f");
  const style = opts.style;
  const palette =
    style === "dark"
      ? {
          bg: "#0d0d0c",
          card: "#0d0d0c",
          ink: "#f3f3f1",
          muted: "#a3a29d",
          line: "#2a2a27",
          star: luminance(accent) < 0.08 ? "#f3f3f1" : accent,
        }
      : style === "color"
        ? (() => {
            const on = luminance(accent) > 0.45 ? "#1c1c1b" : "#ffffff";
            return {
              bg: accent,
              card: accent,
              ink: on,
              muted: on === "#ffffff" ? "rgba(255,255,255,0.78)" : "rgba(28,28,27,0.7)",
              line: "transparent",
              star: on,
            };
          })()
        : {
            bg: style === "card" ? "#f4f4f2" : "#ffffff",
            card: "#ffffff",
            ink: "#1c1c1b",
            muted: "#64635f",
            line: "#e6e5e1",
            star: luminance(accent) > 0.8 ? "#1c1c1b" : accent,
          };

  const [avatar, logo] = await Promise.all([dataUrl(t.avatar_key), opts.logo === "1" ? dataUrl(space.logo_key) : Promise.resolve(null)]);
  const text = t.text.length > MAX_CHARS[opts.size] ? `${t.text.slice(0, MAX_CHARS[opts.size] - 1).trimEnd()}…` : t.text;
  const role = [t.title, t.company].filter(Boolean).join(", ");
  const scale = opts.size === "landscape" ? 0.86 : 1;
  const pad = Math.round((opts.size === "story" ? 96 : 80) * scale);
  const card = style === "card";

  const body = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: Math.round(64 * scale) }}>
      <div style={{ display: "flex", flexDirection: "column", gap: Math.round(36 * scale) }}>
        {t.rating ? (
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <svg key={i} width={Math.round(46 * scale)} height={Math.round(46 * scale)} viewBox="0 0 24 24">
                <path d={STAR} fill={palette.star} opacity={i <= (t.rating ?? 0) ? 1 : 0.22} />
              </svg>
            ))}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            fontSize: quoteSize(opts.size, text.length),
            lineHeight: 1.3,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: palette.ink,
            whiteSpace: "pre-wrap",
          }}
        >
          {text}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: Math.round(22 * scale) }}>
          {avatar ? (
            <img
              src={avatar}
              width={Math.round(100 * scale)}
              height={Math.round(100 * scale)}
              style={{ borderRadius: 999, objectFit: "cover" }}
              alt=""
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: Math.round(100 * scale),
                height: Math.round(100 * scale),
                borderRadius: 999,
                background: style === "color" ? "rgba(255,255,255,0.18)" : style === "dark" ? "#2a2a27" : "#ebebe8",
                color: palette.muted,
                fontSize: Math.round(36 * scale),
                fontWeight: 600,
              }}
            >
              {initials(t.name)}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{ display: "flex", fontSize: Math.round(40 * scale), fontWeight: 600, color: palette.ink, letterSpacing: "-0.01em" }}
            >
              {t.name}
            </div>
            {role && <div style={{ display: "flex", fontSize: Math.round(32 * scale), color: palette.muted }}>{role}</div>}
          </div>
        </div>
        {logo && (
          <img src={logo} height={Math.round(64 * scale)} style={{ maxWidth: Math.round(240 * scale), objectFit: "contain" }} alt="" />
        )}
      </div>
    </div>
  );

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: card ? pad * 0.75 : pad,
        background: palette.bg,
        fontFamily: "Geist",
      }}
    >
      {card ? (
        <div
          style={{
            display: "flex",
            flex: 1,
            padding: pad,
            background: palette.card,
            borderRadius: 32,
            border: `2px solid ${palette.line}`,
          }}
        >
          {body}
        </div>
      ) : (
        body
      )}
    </div>,
    { width, height, fonts: await ogFonts() },
  );
}

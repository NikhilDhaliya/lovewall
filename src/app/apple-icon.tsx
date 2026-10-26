import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const HEART =
  "M12 20.4c-.3 0-.6-.1-.8-.3C6.3 16 3.2 13.1 3.2 9.4 3.2 6.6 5.3 4.5 8 4.5c1.6 0 3 .7 4 2 1-1.3 2.4-2 4-2 2.7 0 4.8 2.1 4.8 4.9 0 3.7-3.1 6.6-8 10.7-.2.2-.5.3-.8.3z";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#c8461f" }}>
      <svg width="116" height="116" viewBox="0 0 24 24">
        <path d={HEART} fill="#ffffff" />
      </svg>
    </div>,
    size,
  );
}

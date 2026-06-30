import { ImageResponse } from "next/og";
import { DEFINITION } from "@/lib/site";

// Branded OG/social-share image, generated from our own design tokens (no
// external/licensed art). Next serves this as the Open Graph image for `/`
// (and, via twitter-image re-export, the Twitter card). 1200x630 is the
// standard social card size.
export const alt = "AgentBoard — open-source MCP control plane for AI agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Operator-console palette (mirrors globals.css; ImageResponse can't read CSS vars).
const PAPER = "#f0ece6";
const PAPER_2 = "#e7e1d8";
const INK = "#1a1714";
const INK_SOFT = "#6b6157";
const ORANGE = "#e84500";
const LINE = "#cdc4b8";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          // Faint operator grid, like the site background.
          backgroundImage: `linear-gradient(${LINE}40 1px, transparent 1px), linear-gradient(90deg, ${LINE}40 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          padding: "64px 72px",
          fontFamily: "monospace",
        }}
      >
        {/* System bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: ORANGE, fontSize: 26, letterSpacing: 6, fontWeight: 700 }}>
            SYS:: AGENTBOARD
          </span>
        </div>

        {/* Wordmark + definition */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              fontSize: 104,
              fontWeight: 800,
              color: INK,
              lineHeight: 1,
              letterSpacing: -2,
            }}
          >
            AgentBoard
          </div>
          <div style={{ fontSize: 30, color: INK_SOFT, maxWidth: 980, lineHeight: 1.35 }}>
            {DEFINITION}
          </div>
        </div>

        {/* Footer accent row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: ORANGE }} />
          <span style={{ fontSize: 22, color: INK_SOFT }}>
            open source · MCP-native · self-hostable
          </span>
          <div style={{ flex: 1, height: 2, background: PAPER_2, marginLeft: 8 }} />
        </div>
      </div>
    ),
    size
  );
}

import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

export const runtime = "edge";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";

/** Local truncation fallback — instant, no network. */
function truncateLocal(post: string): string {
  const clean = post.replace(/\n+/g, " ").trim();
  const cut = clean.slice(0, 260);
  const lastPeriod = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastPeriod > 80) return cut.slice(0, lastPeriod + 1).trim();
  return cut.trim() + (clean.length > 260 ? "…" : "");
}

/** AI condense with 5s timeout — falls back to local truncation on any failure. */
async function condensePost(post: string): Promise<string> {
  if (!OPENROUTER_KEY) return truncateLocal(post);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        max_tokens: 80,
        temperature: 0.6,
        messages: [
          { role: "system", content: "Condense this LinkedIn post to exactly 40–50 words. Keep the sharpest insight. Output ONLY the condensed text — no quotes, no labels." },
          { role: "user", content: post },
        ],
      }),
    });
    if (!res.ok) return truncateLocal(post);
    const data = await res.json() as any;
    const text = (data.choices?.[0]?.message?.content || "").trim();
    return text || truncateLocal(post);
  } catch {
    return truncateLocal(post);
  }
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function POST(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { post } = await req.json();
  if (!post || typeof post !== "string") {
    return new Response(JSON.stringify({ error: "Missing post text." }), { status: 400 });
  }

  const condensed = condensePost(post);

  // Random engagement numbers (all under 1000)
  const replies   = rand(120, 999);
  const retweets  = rand(80,  799);
  const likes     = rand(400, 999);
  const bookmarks = rand(50,  499);

  // Static timestamp
  const timestamp = "12:09 PM · 2/16/26";
  const views = `${rand(3, 9)}.${rand(1, 9)}K`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#000000",
          fontFamily: "sans-serif",
        }}
      >
        {/* ── Status bar ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 28px 10px",
            color: "#ffffff",
            fontSize: "26px",
            fontWeight: 700,
          }}
        >
          <span>13:31</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "22px" }}>
            <span>WiFi</span>
            <span>●●●</span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#4caf50",
                borderRadius: "8px",
                padding: "2px 10px",
                fontSize: "22px",
                fontWeight: 700,
                color: "#000",
              }}
            >
              61
            </div>
          </div>
        </div>

        {/* ── Nav bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 28px 18px",
          }}
        >
          <span style={{ color: "#ffffff", fontSize: "34px", fontWeight: 700, marginRight: "auto" }}>←</span>
          <span
            style={{
              color: "#ffffff",
              fontSize: "28px",
              fontWeight: 700,
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            Post
          </span>
          <span style={{ color: "#ffffff", fontSize: "34px", marginLeft: "auto" }}>•••</span>
        </div>

        {/* ── Thin top divider ── */}
        <div style={{ height: "1px", background: "#2f3336", margin: "0 0 0 0" }} />

        {/* ── Post card ── */}
        <div style={{ display: "flex", padding: "32px 28px 0", gap: "20px" }}>
          {/* Avatar */}
          <div
            style={{
              width: "88px",
              height: "88px",
              borderRadius: "50%",
              background: "#1d9bf0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: "30px",
              flexShrink: 0,
              letterSpacing: "-1px",
            }}
          >
            CR
          </div>

          {/* Name + handle + X.com */}
          <div style={{ display: "flex", flex: 1, justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#ffffff", fontWeight: 800, fontSize: "28px" }}>CRIDL</span>
                {/* Verified badge — blue circle with white tick */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: "#1d9bf0",
                    color: "#ffffff",
                    fontWeight: 900,
                    fontSize: "18px",
                  }}
                >
                  ✓
                </div>
              </div>
              <span style={{ color: "#71767b", fontSize: "24px" }}>@cridl_in</span>
            </div>
            {/* X.com label */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#ffffff", fontWeight: 900, fontSize: "26px" }}>𝕏</span>
              <span style={{ color: "#71767b", fontSize: "22px" }}>.com</span>
            </div>
          </div>
        </div>

        {/* ── Post text ── */}
        <div
          style={{
            color: "#e7e9ea",
            fontSize: "30px",
            lineHeight: 1.55,
            padding: "28px 28px 0 136px",
            whiteSpace: "pre-wrap",
          }}
        >
          {condensed}
        </div>

        {/* ── Timestamp + views ── */}
        <div
          style={{
            color: "#71767b",
            fontSize: "22px",
            padding: "28px 28px 24px 136px",
          }}
        >
          {timestamp} · <span style={{ color: "#e7e9ea" }}>{views}</span> Views
        </div>

        {/* ── Divider ── */}
        <div style={{ height: "1px", background: "#2f3336", margin: "0 28px" }} />

        {/* ── Engagement stats ── */}
        <div
          style={{
            display: "flex",
            padding: "24px 40px",
            gap: "0px",
            borderBottom: "1px solid #2f3336",
          }}
        >
          {[
            { label: "Replies",   val: replies   },
            { label: "Reposts",   val: retweets  },
            { label: "Likes",     val: likes     },
            { label: "Bookmarks", val: bookmarks },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: 1,
              }}
            >
              <span style={{ color: "#ffffff", fontSize: "26px", fontWeight: 700 }}>{item.val}</span>
              <span style={{ color: "#71767b", fontSize: "20px" }}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* ── Engagement icon row ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            padding: "24px 40px",
            color: "#71767b",
            fontSize: "30px",
          }}
        >
          <span>💬</span>
          <span>🔁</span>
          <span>♡</span>
          <span>📤</span>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    }
  );
}

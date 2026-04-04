import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

async function getUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth!.verifyIdToken(auth.slice(7));
    return decoded.uid;
  } catch { return null; }
}

async function callOpenRouter(messages: any[], model: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: 1200 }),
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;
  const campaignSnap = await adminDb!.collection("campaigns").doc(campaignId).get();
  if (!campaignSnap.exists || campaignSnap.data()?.user_id !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const campaign = campaignSnap.data()!;
  const model = "google/gemini-2.0-flash-001";

  // Step 1: Shared research
  const researchPrompt = `You are a research assistant. Provide a concise synthesis of key insights, angles, trends, and talking points for the following LinkedIn campaign topic. This will be used to generate ${campaign.post_count} sequential LinkedIn posts.\n\nTopic: ${campaign.topic}\nAudience: ${campaign.audience}\nTone: ${campaign.tone}\n\nProvide 5-7 key insights, each on a new line, that can each become a unique LinkedIn post angle. Be specific and data-driven where possible.`;

  let synthesis = "";
  try {
    synthesis = await callOpenRouter([{ role: "user", content: researchPrompt }], model);
  } catch {
    synthesis = `Key topic: ${campaign.topic}. Target: ${campaign.audience}.`;
  }

  // Step 2: Delete any existing draft posts for this campaign first
  const existingSnap = await adminDb!.collection("posts").where("campaign_id", "==", campaignId).where("status", "==", "draft").get();
  if (existingSnap.docs.length > 0) {
    const batch = adminDb!.batch();
    existingSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // Step 3: Generate N posts sequentially
  const posts: Array<{ id: string; campaign_position: number; content: string }> = [];
  let campaign_context = "";

  for (let i = 0; i < campaign.post_count; i++) {
    const position = i + 1;
    const systemPrompt = `You are an expert LinkedIn content writer. Write a single high-performing LinkedIn post.

RULES:
- Hook: powerful first line that stops the scroll
- Body: value-rich insights, short punchy paragraphs
- Use bullet points and white space for readability
- End with a conversational question or CTA
- Tone: ${campaign.tone}
- Length: ${campaign.length === "short" ? "150-250 words" : campaign.length === "long" ? "400-600 words" : "250-400 words"}
- NO fabrication — only use real, verifiable insights
- Do NOT use hashtags unless essential
${campaign.custom_instructions ? `\nAdditional instructions: ${campaign.custom_instructions}` : ""}`;

    const userPrompt = `Write post ${position} of ${campaign.post_count} in a LinkedIn campaign series.

Topic: ${campaign.topic}
Audience: ${campaign.audience}

Research insights for this campaign:
${synthesis}

${campaign_context ? `## Prior posts in this campaign (take a FRESH angle, do NOT repeat these angles):\n${campaign_context}\n` : ""}

Write post ${position} now. Take angle ${position} from the research insights. Output ONLY the post text, nothing else.`;

    try {
      const content = await callOpenRouter([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ], model);

      const ref = await adminDb!.collection("posts").add({
        user_id: uid,
        campaign_id: campaignId,
        campaign_position: position,
        segment: campaign.segment,
        status: "draft",
        content: content.trim(),
        topic: campaign.topic,
        tone: campaign.tone,
        audience: campaign.audience,
        length: campaign.length,
        created_at: FieldValue.serverTimestamp(),
      });

      posts.push({ id: ref.id, campaign_position: position, content: content.trim() });
      const firstLine = content.trim().split("\n")[0].slice(0, 120);
      campaign_context += `Post ${position}: "${firstLine}"\n`;
    } catch {
      posts.push({ id: "", campaign_position: position, content: "" });
    }
  }

  return NextResponse.json({ posts });
}

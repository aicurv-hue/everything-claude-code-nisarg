import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { checkAndIncrementBulk } from "@/lib/usageTracking";
import { getUserPlan, canUseCampaigns } from "@/lib/checkSubscription";
import { rewriteInVoice } from "@/lib/ai/rewriteInVoice";
import { withDateContext } from "@/lib/ai/currentContext";

async function getUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth!.verifyIdToken(auth.slice(7));
    return decoded.uid;
  } catch { return null; }
}

const CAMPAIGN_FALLBACK_MODEL = "google/gemini-2.5-flash";

async function callOpenRouter(messages: any[], model: string): Promise<string> {
  for (const m of [model, CAMPAIGN_FALLBACK_MODEL]) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: m, messages: withDateContext(messages), max_tokens: 1200 }),
      });
      if (!res.ok) {
        console.warn(`[campaigns] ${m} HTTP ${res.status} — ${m === CAMPAIGN_FALLBACK_MODEL ? "no more fallbacks" : "trying fallback"}`);
        if (m === CAMPAIGN_FALLBACK_MODEL) throw new Error(`OpenRouter error: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      if (text) return text;
    } catch (e) {
      if (m === CAMPAIGN_FALLBACK_MODEL) throw e;
      console.warn(`[campaigns] ${m} threw — falling back:`, (e as any)?.message || e);
    }
  }
  return "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(uid);
  if (!canUseCampaigns(plan)) {
    return NextResponse.json({ error: "Campaigns require Pro or Business plan" }, { status: 403 });
  }

  const { id: campaignId } = await params;
  const campaignSnap = await adminDb!.collection("campaigns").doc(campaignId).get();
  if (!campaignSnap.exists || campaignSnap.data()?.user_id !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const campaign = campaignSnap.data()!;
  const postCount = (campaign.post_count as number) || 1;

  // Check and reserve post generation quota for all campaign posts upfront
  const usageCheck = await checkAndIncrementBulk(uid, "post", postCount);
  if (!usageCheck.allowed) {
    const remaining = usageCheck.limit - usageCheck.used;
    return NextResponse.json(
      {
        error: `Generating this campaign requires ${postCount} post slots, but you only have ${remaining} remaining this month.`,
        code: "LIMIT_EXCEEDED",
        limit: usageCheck.limit,
        used: usageCheck.used,
        plan: usageCheck.plan,
        upgradeUrl: "/#pricing",
      },
      { status: 429 }
    );
  }

  const model = "google/gemini-2.5-flash";

  // Fetch user profile for brand context
  let clientProfile: string = "";
  try {
    const profileSnap = await adminDb!.collection("profiles").doc(uid).get();
    if (profileSnap.exists) {
      const profileData = profileSnap.data() as any;
      const seg = profileData?.[campaign.segment];
      if (seg) {
        const parts: string[] = [];
        if (seg.name) parts.push(`Name: ${seg.name}`);
        if (seg.role) parts.push(`Role: ${seg.role}`);
        if (seg.industry) parts.push(`Industry: ${seg.industry}`);
        if (seg.niche) parts.push(`Niche: ${seg.niche}`);
        if (seg.personality) parts.push(`Personality: ${seg.personality}`);
        if (seg.icp) parts.push(`Target audience: ${seg.icp}`);
        if (seg.brandVoice) parts.push(`Brand voice: ${seg.brandVoice}`);
        clientProfile = parts.join("\n");
      }
    }
  } catch { /* non-blocking */ }

  // Fetch recent memory context (last 3 posts) for voice consistency
  let memoryContext: string = "";
  let voiceSamples: any[] = [];
  try {
    // Single where clause — avoids composite index requirement; filter segment in memory
    const memSnap = await adminDb!.collection("post_memories")
      .where("user_id", "==", uid)
      .orderBy("created_at", "desc")
      .limit(10)
      .get();
    if (!memSnap.empty) {
      const segMemories = memSnap.docs
        .filter(d => d.data().segment === campaign.segment)
        .slice(0, 3)
        .map(d => d.data() as any);
      voiceSamples = segMemories;
      const entries = segMemories
        .map(m => `Topic: ${m.topic || ""}\nSummary: ${m.summary || ""}\nStyle: ${m.style_notes || ""}`)
        .join("\n---\n");
      if (entries) memoryContext = entries;
    }
  } catch { /* non-blocking */ }

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
    const systemPrompt = `You are an expert LinkedIn content writer creating a campaign series.
${clientProfile ? `\n## AUTHOR PROFILE\n${clientProfile}\n` : ""}
${memoryContext ? `\n## AUTHOR'S RECENT WRITING STYLE (match this voice exactly)\n${memoryContext}\n` : ""}
RULES:
- CHARACTER TARGET: Aim for 1,200–2,500 characters total. This is the LinkedIn sweet spot for dwell time.
- HOOK: Max 2 lines, ideally 1 line. Each line under 49 characters. Create a curiosity gap. Never start with "I wanted to share...", "Excited to announce...", or "In today's digital age..."
- BODY: Short punchy paragraphs (max 2 sentences each). One blank line between every paragraph. Sentences 10–19 words, Grade 5–7 reading level.
- For lists, use a plain dash (–), never * or **markdown**.
- End with a specific, easy-to-answer question or a strong declarative statement. Never use "What's the one thing holding you back from [X]?" or engagement bait like "Comment YES" or "Drop a 🔥".
- Tone: ${campaign.tone}
- Length: ${campaign.length === "short" ? "120-180 words" : campaign.length === "long" ? "350-450 words" : "200-300 words"}
- Write in the author's voice — use their personality and style
- NO fabrication — only real, verifiable insights. Never invent stats.
- HASHTAGS: 0–3 max. Only use hashtags that join real community conversations. Zero is valid.
- MAX 2 stats per post. If no verifiable source, drop the stat.
- Be opinionated — have a clear POV. Posts with stance outperform neutral explainers.

AI SLOP BAN — never use these:
- Corporate jargon: game-changer, leverage, synergy, ecosystem, paradigm, streamline, optimize, innovative, empower, unlock, journey
- Clichéd openers: "In today's digital age", "In the ever-evolving landscape"
- Excessive em dashes, symmetric structure (exactly 3 of everything), vague motivational fluff
- No exclamation points. No external links in post body.
${campaign.custom_instructions ? `\nAdditional instructions: ${campaign.custom_instructions}` : ""}`;

    const userPrompt = `Write post ${position} of ${campaign.post_count} in a LinkedIn campaign series.

Topic: ${campaign.topic}
Audience: ${campaign.audience}

Research insights for this campaign:
${synthesis}

${campaign_context ? `## Prior posts in this campaign (full content — ensure your post takes a COMPLETELY FRESH angle and builds the narrative forward):\n${campaign_context}\n` : ""}

Write post ${position} now. Take angle ${position} from the research insights. Output ONLY the post text, nothing else.`;

    try {
      const draft = await callOpenRouter([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ], model);
      const draftTrim = draft.trim();

      // Voice-rewrite pass — same focused 2nd pass used by /api/ai/generate so
      // campaign posts come out sounding human, not AI-flavoured.
      const rewriteResult = await rewriteInVoice({
        rawText: draftTrim,
        voiceProfile: clientProfile,
        writingSamples: voiceSamples,
        timeoutMs: 10000,
      });
      const finalContent = rewriteResult.ok ? rewriteResult.rewrittenPost : draftTrim;

      // Generate image prompt for this post (non-blocking — stored for later use)
      let imagePrompt = "";
      try {
        const ipRes = await callOpenRouter([
          { role: "system", content: "You write concise image generation prompts for LinkedIn posts. Output ONLY the prompt, 1-2 sentences, no quotes." },
          { role: "user", content: `Write an image generation prompt for this LinkedIn post:\n\nTopic: ${campaign.topic}\nPost:\n${finalContent.slice(0, 400)}` },
        ], model);
        imagePrompt = ipRes.trim();
      } catch { /* non-blocking */ }

      const ref = await adminDb!.collection("posts").add({
        user_id: uid,
        campaign_id: campaignId,
        campaign_position: position,
        segment: campaign.segment,
        status: "draft",
        content: finalContent,
        topic: campaign.topic,
        tone: campaign.tone,
        audience: campaign.audience,
        length: campaign.length,
        image_prompt: imagePrompt,
        image_mode: "none",
        created_at: FieldValue.serverTimestamp(),
      });

      posts.push({ id: ref.id, campaign_position: position, content: finalContent });
      campaign_context += `--- POST ${position} ---\n${finalContent}\n\n`;
    } catch {
      posts.push({ id: "", campaign_position: position, content: "" });
    }
  }

  return NextResponse.json({ posts });
}

import type { ProfileSegment } from "@/lib/db/profiles";
import { openRouter } from "./openrouter";

export async function generateIdeas(
  profile: ProfileSegment,
  recentTopics: string[],
  segment: "individual" | "corporate",
  count: number = 10
): Promise<Array<{ title: string; description: string; pillar?: string; suggestedTone?: string; suggestedAudience?: string }>> {
  const pillars = (profile.pillars || "").split(",").map((s) => s.trim()).filter(Boolean);
  const niche = profile.niche || profile.roleOrIndustry || "";
  const icp = profile.icp || "";
  const personality = profile.personality || "";

  const system = `You generate LinkedIn content ideas for a specific professional.
Return ONLY a valid JSON array of objects with these fields:
- title: punchy idea title, under 12 words
- description: 1-2 sentences describing the angle and what to cover
- pillar: which content pillar this maps to (from the list below, or null)
- suggestedTone: one of "professional", "storytelling", "educational", "contrarian"
- suggestedAudience: one of "founders", "marketers", "engineers", "general"

Content pillars: ${pillars.length ? pillars.join(", ") : "not specified"}
Generate exactly ${count} ideas. Each must be unique and specific — no generic advice.`;

  const user = `Profile:
- Niche: ${niche}
- ICP: ${icp}
- Personality: ${personality}
- Segment: ${segment}

Already covered (DO NOT repeat these angles):
${recentTopics.slice(0, 20).map((t) => `- ${t}`).join("\n") || "- (none yet)"}

Generate ${count} fresh, specific LinkedIn post ideas.`;

  try {
    const res = await openRouter.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.9,
      max_tokens: 1200,
    });

    const text = res.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("[idea-generate] Failed:", err);
    return [];
  }
}

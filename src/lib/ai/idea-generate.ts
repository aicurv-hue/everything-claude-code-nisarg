import type { ProfileSegment } from "@/lib/db/profiles";
import { openRouter, DEFAULT_MODEL, FALLBACK_MODEL } from "./openrouter";
import { withDateContext } from "./currentContext";

export async function generateIdeas(
  profile: ProfileSegment,
  recentTopics: string[],
  segment: "individual" | "corporate",
  count: number = 10,
  userPrompt?: string
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

  const guidance = userPrompt?.trim()
    ? `\n\nUser direction (HIGHEST PRIORITY — every idea must clearly relate to this):\n"""${userPrompt.trim()}"""\nAll ${count} ideas must explore different angles of this direction while still fitting the profile above.`
    : "";

  const user = `Profile:
- Niche: ${niche}
- ICP: ${icp}
- Personality: ${personality}
- Segment: ${segment}

Already covered (DO NOT repeat these angles):
${recentTopics.slice(0, 20).map((t) => `- ${t}`).join("\n") || "- (none yet)"}${guidance}

Generate ${count} fresh, specific LinkedIn post ideas.`;

  for (const model of [DEFAULT_MODEL, FALLBACK_MODEL]) {
    try {
      const res = await openRouter.chat.completions.create({
        model,
        messages: withDateContext([
          { role: "system", content: system },
          { role: "user", content: user },
        ]),
        temperature: 0.9,
        max_tokens: 1200,
      });
      const text = res.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn(`[idea-generate] ${model} returned no JSON array — trying next model`);
        continue;
      }
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (err) {
      console.error(`[idea-generate] ${model} failed:`, err);
    }
  }
  return [];
}

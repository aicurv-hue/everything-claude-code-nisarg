/**
 * Maps a non-OK LinkedIn `/rest/posts` response into a user-facing error.
 *
 * The 403/422 "Accessing the resource is forbidden" path on `urn:li:organization:*`
 * targets is the documented LinkedIn restriction on `w_organization_social` —
 * granted at OAuth time but silently degraded by LinkedIn until the app has
 * Marketing Developer Platform (MDP) approval. The same condition makes
 * scheduled posts fail in the cron worker, so we don't recommend "Schedule
 * instead" as a workaround.
 */

export interface MappedPublishError {
  message: string;
  status: number;
  code?: string;
}

export function mapLinkedInPublishError(opts: {
  status: number;
  errText: string;
  segment?: string;
  isTeamMemberCorp?: boolean;
}): MappedPublishError {
  const { status, errText, segment, isTeamMemberCorp } = opts;

  const lower = errText.toLowerCase();
  const isCorpPermission =
    segment === "corporate" &&
    (status === 401 ||
      status === 403 ||
      status === 422 ||
      (status === 400 &&
        (lower.includes("organization permission") ||
          lower.includes("forbidden") ||
          lower.includes("not an admin"))));

  if (isCorpPermission) {
    const owner = isTeamMemberCorp ? "The team owner's" : "Your";
    return {
      message:
        `LinkedIn blocked this company-page post (${status}). ${owner} LinkedIn app needs ` +
        `Marketing Developer Platform (MDP) approval before company-page posts will publish — ` +
        `until then, neither immediate publishing nor scheduling will work. ` +
        `Workaround for now: post to a personal profile instead, or apply for MDP at ` +
        `https://www.linkedin.com/developers/apps. Also worth checking: that ` +
        `${isTeamMemberCorp ? "the team owner" : "you"} are an Admin of the LinkedIn Page and ` +
        `that the Organization ID in Settings is correct.`,
      status: 422,
      code: "PARTNER_APPROVAL_REQUIRED",
    };
  }

  let liError = "Publishing failed. Please try again.";
  try {
    const parsed = JSON.parse(errText);
    const msg = parsed.message || parsed.error_description || parsed.error || "";
    if (msg && msg.length < 300) liError = msg;
  } catch {
    // Non-JSON body — keep the default message.
  }

  return { message: liError, status };
}

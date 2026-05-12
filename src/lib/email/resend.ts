import { Resend } from "resend";

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  return new Resend(key);
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "Cridl <invites@cridl.app>";
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://cridl.app";
}

export interface SendInviteOpts {
  to: string;
  inviterName: string;
  teamLabel: string;
  inviteToken: string;
}

export async function sendTeamInviteEmail({ to, inviterName, teamLabel, inviteToken }: SendInviteOpts) {
  const appUrl = getAppUrl();
  const acceptUrl = `${appUrl}/invite/${encodeURIComponent(inviteToken)}`;

  const subject = `${inviterName} invited you to join their Cridl team`;
  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;color:#111">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 16px">You've been invited to ${escapeHtml(teamLabel)}</h1>
  <p style="font-size:15px;line-height:1.55;margin:0 0 24px;color:#444">
    ${escapeHtml(inviterName)} added you to their Cridl team. You'll get Pro-level features for your personal LinkedIn workspace and you can post on their company page.
  </p>
  <p style="margin:0 0 32px">
    <a href="${acceptUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:500">Accept invite</a>
  </p>
  <p style="font-size:13px;color:#888;margin:0 0 8px">Or paste this link into your browser:</p>
  <p style="font-size:13px;color:#555;word-break:break-all;margin:0 0 32px">${acceptUrl}</p>
  <p style="font-size:12px;color:#999;margin:0">This invite expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
</div>`.trim();

  const text = [
    `${inviterName} invited you to join their Cridl team (${teamLabel}).`,
    ``,
    `Accept here: ${acceptUrl}`,
    ``,
    `This invite expires in 7 days.`,
  ].join("\n");

  const client = getClient();
  return client.emails.send({
    from: getFromAddress(),
    to,
    subject,
    html,
    text,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

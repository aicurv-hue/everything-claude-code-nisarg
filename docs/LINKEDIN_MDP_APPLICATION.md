# Cridl — LinkedIn Marketing Developer Platform Application Prep

> Prep pack for applying the **existing** Cridl LinkedIn app (the one already issuing `LINKEDIN_CLIENT_ID`) to LinkedIn's Marketing Developer Platform (MDP) so `w_organization_social` is actually granted and company-page posts stop returning 403.
>
> Owner of this doc: Nisarg (LinkedIn app admin)

---

## 1. Reality check — what this unlocks and what it doesn't

**Unlocks (the whole point):**
- Posting to LinkedIn Pages via `urn:li:organization:{id}` — currently the LinkedIn API silently returns 403 because the OAuth grant is degraded until MDP approval.
- Both "Post now" and scheduled cron publishing for the Corporate workspace start working without code changes.
- Same path works for both solo Corporate users and team members (member-drafted posts already route through the team owner's token — that token just needs MDP).

**Does NOT unlock:**
- Engagement data (likes, comments, impressions) — that's a separate product: **Community Management API** (CMA). Different application, different criteria, much stricter. Apply for MDP first, CMA later if you want analytics.

**Realistic timeline:** 2–6 weeks for first response. ~60% first-pass approval based on public LinkedIn dev forum data. If rejected, you can revise and resubmit; the form remembers your prior answers.

---

## 2. Pre-flight — DO THESE FIRST (otherwise application gets bounced)

LinkedIn reviewers check these BEFORE reading your written answers. Missing items = automatic reject without explanation.

### 🚨 Blocker 1 — Privacy Policy URL (currently missing)
The app has **no `/privacy` route**. The marketing site (`cridl.com`) may have one — please confirm before submitting.

- **Required:** A live, publicly-accessible URL that explicitly mentions:
  - What user data is collected (email, name, LinkedIn profile, posts you write, images you upload)
  - Why (to provide the LinkedIn posting service)
  - Where it's stored (Firebase / Firestore — name a region, e.g. "Google Cloud `asia-south1`")
  - How LinkedIn data is used (only to post on the user's behalf via their consent)
  - How users can delete their data (Settings → Account → Delete, or `support@cridl.app`)
  - GDPR / India DPDP basis if you have EU/India users
- **If you need one fast:** I can generate a Cridl-specific privacy policy at `https://app.cridl.com/privacy` in ~30 minutes. Just ask.

### 🚨 Blocker 2 — Terms of Service URL (currently missing)
Same situation as privacy policy.

- **Required:** A live URL covering acceptable-use, payment terms, account termination, liability disclaimer, governing law (India).
- **If you need one fast:** Same offer — I can scaffold `https://app.cridl.com/terms` from a SaaS template tailored to Cridl.

### Blocker 3 — App icon (high-res)
LinkedIn requires a 100×100px (minimum) square logo for the OAuth consent screen. Upload it under "Settings → App Logo" in your existing LinkedIn app before submitting.

### Blocker 4 — Verified Page admin status
- The LinkedIn account you'll use for testing MUST be listed as a **Super Admin** of at least one LinkedIn Page (your own company's Page is fine).
- Verify at: https://www.linkedin.com/company/{your-org-id}/admin/page-posts/published/ — you should see "Admin View" controls.
- Without an admin connection, LinkedIn rejects MDP because they can't verify your need for `w_organization_social`.

### Blocker 5 — Demo video (3–5 minutes)
LinkedIn reviewers WILL ask for one if you don't include it. Pre-recording it shortens approval time significantly. Script in §5 below.

### Recommended — Production traffic
LinkedIn favours apps that show real usage. Your current 500+ posts published number (from the product brief) is meaningful — surface it in the application copy. If you have any beta users posting to Pages already (via the personal-profile fallback), screenshot one.

---

## 3. Where to apply

1. Sign in at https://www.linkedin.com/developers/apps with the same LinkedIn account that owns the existing Cridl app.
2. Open your Cridl app → tab **Products**.
3. Find **"Share on LinkedIn"** (you already have this).
4. Find **"Marketing Developer Platform"** → click **Request access**.
5. The form has two parts: a public-facing app profile (already filled if your app is live) + an MDP-specific questionnaire. The §4 copy below is for the MDP questionnaire.

---

## 4. Application copy (ready to paste)

LinkedIn's MDP form changes wording occasionally, but the questions below are stable. Match each header to the closest field on the live form.

### Q: Company name
```
Cridl (operated by [your registered business name, e.g. "Cridl Technologies Pvt. Ltd."])
```

### Q: Company website
```
https://cridl.com
```

### Q: Product / app name
```
Cridl — LinkedIn Content Automation
```

### Q: Brief product description (1-2 sentences)
```
Cridl is a SaaS product that helps professionals and small businesses
maintain a consistent LinkedIn presence by researching, writing, and
scheduling LinkedIn posts in the user's voice. We use OpenRouter-hosted
AI models to draft posts and the LinkedIn API to publish them on the
user's behalf — to their personal profile (w_member_social) or their
verified company Page (w_organization_social).
```

### Q: Why do you need access to the Marketing Developer Platform?
```
We provide AI-assisted LinkedIn posting for individual professionals
and small businesses, including a "Business" tier where a team of up to
six can collaborate on posts that publish to their shared company Page.

Without Marketing Developer Platform access, OAuth grants the
w_organization_social scope on paper but LinkedIn degrades the token at
the API layer — every POST to /rest/posts on an urn:li:organization:*
URN returns 403 "Accessing the resource is forbidden." This blocks the
entire Corporate workspace product surface for our paying Business-tier
customers.

We have a working LinkedIn OAuth integration in production today,
500+ posts published successfully via w_member_social on personal
profiles, and a clear separation between Individual and Corporate
workspaces in our UI so users explicitly choose which surface to post
to. We need MDP solely so Corporate posts route to the customer's own
verified Company Page — never any other organization.
```

### Q: What LinkedIn API endpoints will you use, and how?
```
PRIMARY USE (need MDP for this):
- POST  /rest/posts  with author = urn:li:organization:{customer's org id}
  Purpose: publish a customer-authored post to their own verified Company
  Page. Triggered when the user clicks "Post now" or when our hourly
  cron worker finds a scheduled post whose time has arrived.

- POST  /rest/images?action=initializeUpload     (org-owner URN)
- PUT   {LinkedIn-provided upload URL}            (binary image)
  Purpose: attach AI-generated images to the post above.

- POST  /rest/documents?action=initializeUpload  (org-owner URN)
- PUT   {LinkedIn-provided upload URL}            (PDF binary)
  Purpose: multi-image carousel posts (LinkedIn renders PDFs as carousels).

ALREADY USING (existing scopes, working today):
- GET   /v2/userinfo                              (openid + profile + email)
- POST  /rest/posts with author = urn:li:person:* (w_member_social)
- POST  /rest/images / /rest/documents on personal URN

NOT REQUESTED:
- Community Management API (reactions, comments, socialActions) — we
  will apply for this separately if/when our customers need engagement
  analytics. Not in scope for this application.
```

### Q: How do you obtain user consent for posting on their behalf?
```
Every customer connects their own LinkedIn account via the standard
LinkedIn OAuth 2.0 Authorization Code flow at /api/auth/linkedin.
Scopes requested: openid, profile, email, w_member_social, and
w_organization_social.

Once authorized:
1. Every post is drafted in our editor, shown in a preview screen, and
   ONLY published after the user clicks "Post now" or sets an explicit
   future "Schedule" date — we never auto-generate-and-publish.
2. Scheduled posts can be edited or deleted from /dashboard/schedule
   right up until the cron picks them up.
3. The user can revoke our app's access at any time from LinkedIn's own
   "Allowed apps" page; we also expose a one-click "Disconnect LinkedIn"
   button in Settings that clears the stored tokens.
4. Corporate posts use the LinkedIn Organization ID the customer enters
   themselves in Settings — we never derive or guess which Page to post
   to. The customer must already be a verified admin of that Page on
   LinkedIn for posts to land (we don't try to elevate permissions).
```

### Q: How is user data stored and secured?
```
- All LinkedIn access tokens and refresh tokens are stored in Firestore
  under a per-user document (tokens/{firebaseUid}) and accessed exclusively
  via Firebase Admin SDK on the server side. Tokens are never exposed
  to the browser.
- All API calls to LinkedIn use Authorization: Bearer headers — never
  cookies or query-string credentials.
- Access tokens are auto-refreshed silently via the standard LinkedIn
  refresh-token flow when within 5 minutes of expiry.
- Posts authored in our editor are stored in Firestore under the
  authoring user's UID. They are never re-published to LinkedIn without
  an explicit publish or schedule action by that user.
- Users can delete their account (which deletes all their data
  including tokens) from Settings → Account, or by emailing
  support@cridl.app.
- Privacy Policy: https://app.cridl.com/privacy
- Terms of Service: https://app.cridl.com/terms
```

### Q: Will you use the data for advertising, retargeting, or sale?
```
No. We do not sell, share, or monetize user data. The LinkedIn data we
access (user profile, the user's own published posts as memory context,
and the Page they explicitly choose to post to) is used solely to
provide the posting service to that same user. We do not run ads,
syndicate data to third parties, or build aggregate profiles.
```

### Q: Production URL / where can we test the integration?
```
Production: https://app.cridl.com
Marketing site: https://cridl.com

Demo account for LinkedIn reviewers:
- Email: [create one — e.g. "linkedin-review@cridl.com" — and pre-load it with one Page admin connection]
- Password: [generate a strong one and include here]
- Walkthrough: see attached demo video (3 minutes).
```

### Q: Demo video URL
```
[Upload to YouTube as Unlisted and paste the URL here. Script in §5.]
```

---

## 5. Demo video script (3–5 min, screencast)

LinkedIn reviewers want to see the integration work end-to-end. Keep it tight; they watch a lot of these.

**Recording tool:** Loom, OBS, or QuickTime. Browser at 1920×1080. Webcam optional but adds trust.

**Voiceover:**

> **(0:00–0:20) Intro.**
> "Hi LinkedIn team — I'm [name], founder of Cridl. Cridl is an AI assistant that helps professionals and small businesses post consistently on LinkedIn. We currently have several hundred users publishing personal-profile posts via the LinkedIn API, and we're applying for Marketing Developer Platform access so our Business-tier customers can also publish to their own verified company Pages. Let me show you what they'd do."

> **(0:20–0:50) OAuth consent flow.**
> Open a fresh Incognito window. Go to `app.cridl.com`. Sign up with a new email. Click "Connect LinkedIn" in Settings. Walk through LinkedIn's own consent screen — narrate: "Here's the standard LinkedIn OAuth 2.0 consent screen. Notice the scopes we request: profile, email, w_member_social, and w_organization_social. The user sees and approves each one." Click Allow.

> **(0:50–1:30) Personal-profile post (works today).**
> Back in Cridl. Pick "Individual" workspace. Enter a topic. Show the AI generating the post + image. On the preview, narrate: "This is the editable preview — we never publish without the user reviewing." Click "Post now." Open LinkedIn in another tab — show the new post on the personal profile.

> **(1:30–2:30) Company-page post (the new capability).**
> Switch to "Corporate" workspace in Cridl. Show the user entering their company's Organization ID in Settings (and narrate: "Customers find this in their own LinkedIn Page Admin URL — we never derive or guess this; the user must be an admin of the Page they enter"). Draft a post. Show the preview. Click "Post now." Open LinkedIn → show the post live on the company Page.

> **(2:30–3:30) Team collaboration angle.**
> Briefly show `/dashboard/settings/team`. Narrate: "On our Business plan, the page owner can invite up to 5 teammates. Each teammate's posts go through the owner's authorized LinkedIn token — the team owner remains the one who consented to w_organization_social. Members never store the token themselves." Show inviting a member.

> **(3:30–4:00) Wrap.**
> "That's the full flow. We're requesting MDP solely to lift the 403 we currently get on `urn:li:organization` posts — everything else is already built. Privacy and Terms are at app.cridl.com/privacy and /terms. Thanks for reviewing."

**Don't:** show the API error itself, complain about LinkedIn, or mention competitors negatively. Keep it product-focused.

---

## 6. Submission walkthrough (5 minutes once §2 is done)

1. https://www.linkedin.com/developers/apps → open Cridl app.
2. **Settings tab** — verify: app logo (100×100+), company URL, privacy URL, terms URL all populated. Save.
3. **Auth tab** — verify the redirect URL matches `https://app.cridl.com/api/auth/linkedin/callback`.
4. **Products tab** → **Marketing Developer Platform** → **Request access**.
5. Paste §4 answers into the matching fields. Upload demo video as a URL.
6. Submit.

LinkedIn confirms receipt by email immediately. Substantive response in 2–6 weeks. Watch the email address tied to your LinkedIn developer account.

---

## 7. After submission — what to expect

| Outcome | Response time | What to do |
|---|---|---|
| **Approved** | 2–6 weeks | Nothing. Existing Cridl code will start working — `w_organization_social` becomes a real grant on next OAuth refresh. Existing connected users may need to re-consent once for the new scope to take effect; we already request it at OAuth time so this is automatic. |
| **Rejected with feedback** | 2–6 weeks | The email will list specific gaps. Address them and resubmit on the same form. Common rejects: missing demo video, missing Pages admin proof, vague use case. |
| **Rejected with no detail** | 2–6 weeks | This happens. Resubmit with a tighter §4 use case answer and a longer demo. Mention on the form that this is a resubmission. |
| **"Need more information"** | 1–2 weeks | Reply on the email thread, not via a new submission. Keep replies short, factual, and link-backed. |

---

## 8. Bridge plan while waiting

Until MDP approval lands:
- Solo Pro/Business users → instruct them to post to personal profile from the Individual workspace.
- Team members → same. The team's company-page queue can keep building drafts; they'll publish automatically the moment approval lands and the cron next runs.
- Consider building the **Assisted-publish flow** (copy text + open LinkedIn Page composer in new tab) as a short-term parallel surface so paying Business customers get value today. See conversation history for the spec.

---

*Last updated: 2026-05-16. Update this doc with submission date + LinkedIn ticket reference once submitted.*

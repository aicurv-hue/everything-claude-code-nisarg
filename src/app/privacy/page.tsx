import HomeNavbar from "@/components/HomeNavbar";

export const metadata = {
  title: "Privacy Policy · Cridl",
  description:
    "How Cridl collects, stores, and uses your data — including the LinkedIn profile and tokens needed to publish posts on your behalf.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <HomeNavbar />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: 16 May 2026</p>

        <Section title="1. Who we are">
          <p>
            Cridl is an AI-assisted LinkedIn content tool that helps professionals
            and small businesses draft, schedule, and publish LinkedIn posts in their
            own voice. The Cridl service is operated as a sole proprietorship from
            India. This Privacy Policy applies to the application available at{" "}
            <a href="https://app.cridl.com" className="text-blue-600 underline">
              https://app.cridl.com
            </a>{" "}
            and to all related features.
          </p>
        </Section>

        <Section title="2. What data we collect">
          <p>We collect only the data needed to run the service:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1.5">
            <li>
              <strong>Account data</strong> — your email address and display name,
              captured through Firebase Authentication when you sign up or sign in.
            </li>
            <li>
              <strong>LinkedIn data</strong> — when you connect LinkedIn, we receive
              your LinkedIn user ID (<code>sub</code>), name, email address, and
              profile picture via the <code>openid</code>, <code>profile</code>, and{" "}
              <code>email</code> scopes. We also store your LinkedIn access token and
              refresh token so we can publish posts on your behalf when you ask us
              to.
            </li>
            <li>
              <strong>User-generated content</strong> — posts you draft in our
              editor, AI-generated or uploaded images, your brand profile settings,
              writing samples, and any custom instructions you provide for the AI.
            </li>
            <li>
              <strong>Payment metadata</strong> — when you subscribe to a paid plan,
              we store the Razorpay subscription identifier, plan tier, and renewal
              status. We never see or store your card details — those are held
              entirely by Razorpay.
            </li>
            <li>
              <strong>Usage telemetry</strong> — counts of posts generated and
              published, feature usage for plan-limit enforcement, and basic server
              logs (request paths, status codes) for debugging and abuse prevention.
            </li>
          </ul>
        </Section>

        <Section title="3. Why we collect it (lawful basis)">
          <p>
            We process your data to provide the Cridl service you signed up for —
            researching, drafting, and publishing LinkedIn posts on your behalf. For
            users in India this falls under the <em>contractual necessity</em> basis
            of the Digital Personal Data Protection Act, 2023 (§4(c)). For users in
            the EU/EEA, the equivalent basis is Article 6(1)(b) of the GDPR. We do
            not process your data for advertising or profiling.
          </p>
        </Section>

        <Section title="4. Where it&apos;s stored">
          <p>
            Your account data and content are stored in Google Cloud Firestore via
            Firebase (region <code>asia-south1</code>, Mumbai). The application
            itself is hosted on Vercel. LinkedIn access and refresh tokens are
            stored in a per-user Firestore document (<code>tokens/{`{uid}`}</code>)
            and are accessed only from our server-side API routes — they are never
            sent to your browser or exposed via any public endpoint. All
            communication with LinkedIn uses <code>Authorization: Bearer</code>{" "}
            headers over HTTPS.
          </p>
        </Section>

        <Section title="5. Who we share it with (sub-processors)">
          <p>
            We use a small number of trusted infrastructure providers to operate the
            service. We do not sell or rent your data to any third party, and we do
            not use it for advertising or retargeting.
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1.5">
            <li>
              <strong>Google Firebase / Google Cloud</strong> — authentication,
              database storage, file storage.
            </li>
            <li>
              <strong>Vercel</strong> — application hosting and edge functions.
            </li>
            <li>
              <strong>OpenRouter</strong> — routes the AI inference calls used to
              draft your posts. The post topic, your brand profile, and recent posts
              you&apos;ve published are sent as context.
            </li>
            <li>
              <strong>fal.ai</strong> — generates AI images for your posts based on
              an image prompt derived from the post you wrote.
            </li>
            <li>
              <strong>Razorpay</strong> — payment processing for subscriptions.
            </li>
            <li>
              <strong>LinkedIn</strong> — the publishing target, when you click
              &ldquo;Post now&rdquo; or when a scheduled post becomes due.
            </li>
          </ul>
        </Section>

        <Section title="6. How we use your LinkedIn data">
          <p>
            We only call LinkedIn APIs for scopes you have explicitly granted at
            OAuth time. We never publish a post without an explicit action from you
            — either clicking &ldquo;Post now&rdquo; in the editor, or setting an
            explicit future schedule date that you can edit or delete right up
            until our hourly publisher picks it up. We never read your LinkedIn
            connections, messages, or activity feed.
          </p>
          <p className="mt-2">
            You can revoke our app&apos;s access at any time from{" "}
            <a
              href="https://www.linkedin.com/psettings/permitted-services"
              target="_blank"
              rel="noopener"
              className="text-blue-600 underline"
            >
              LinkedIn&apos;s &ldquo;Permitted Services&rdquo; page
            </a>
            , or by clicking <em>Disconnect LinkedIn</em> inside Cridl&apos;s
            Settings. Both actions delete the stored tokens immediately.
          </p>
        </Section>

        <Section title="7. How long we keep it">
          <p>
            We keep your account data and content for as long as your Cridl account
            is active. When you disconnect LinkedIn, your tokens are deleted
            immediately. When you delete your account, all your data — account,
            posts, tokens, settings — is deleted within 30 days. Backup snapshots
            held by our infrastructure providers may persist for up to 90 days
            before being overwritten.
          </p>
        </Section>

        <Section title="8. Your rights">
          <p>
            You can access, correct, export, or delete your data at any time. Most
            of this is self-serve inside Cridl Settings. For anything you can&apos;t
            do yourself, email{" "}
            <a href="mailto:support@cridl.app" className="text-blue-600 underline">
              support@cridl.app
            </a>{" "}
            and we&apos;ll respond within 30 days. Users in jurisdictions with
            additional rights under GDPR, DPDP, or similar laws (objection,
            restriction, complaint to a supervisory authority) may exercise those
            rights via the same email.
          </p>
        </Section>

        <Section title="9. Cookies and tracking">
          <p>
            We use a small number of strictly-necessary cookies: a Firebase Auth
            session cookie to keep you signed in, and a short-lived LinkedIn OAuth
            state cookie (10-minute lifespan) used only during the LinkedIn connect
            flow to protect against CSRF. We do not use third-party analytics
            pixels or ad-tracking cookies at this time.
          </p>
        </Section>

        <Section title="10. Children">
          <p>
            Cridl is not directed at users under 18. If you believe a minor has
            created a Cridl account, please contact us at{" "}
            <a href="mailto:support@cridl.app" className="text-blue-600 underline">
              support@cridl.app
            </a>{" "}
            and we will delete the account.
          </p>
        </Section>

        <Section title="11. Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. Material changes
            will be notified by email to your registered address before they take
            effect. The &ldquo;Last updated&rdquo; date at the top of this page
            always reflects the current version.
          </p>
        </Section>

        <Section title="12. Contact and jurisdiction">
          <p>
            For any privacy-related question or request, email{" "}
            <a href="mailto:support@cridl.app" className="text-blue-600 underline">
              support@cridl.app
            </a>
            . This policy is governed by the laws of India and any disputes will be
            subject to the exclusive jurisdiction of the courts at our registered
            place of business.
          </p>
        </Section>
      </main>

      <footer className="border-t border-slate-200 mt-16 py-8 text-center text-sm text-slate-500">
        © 2026 Cridl ·{" "}
        <a href="/privacy" className="underline hover:text-slate-700">
          Privacy
        </a>{" "}
        ·{" "}
        <a href="/terms" className="underline hover:text-slate-700">
          Terms
        </a>{" "}
        ·{" "}
        <a
          href="mailto:support@cridl.app"
          className="underline hover:text-slate-700"
        >
          support@cridl.app
        </a>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
      <div className="text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

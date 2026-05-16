import HomeNavbar from "@/components/HomeNavbar";

export const metadata = {
  title: "Terms of Service · Cridl",
  description:
    "The terms that govern your use of Cridl — an AI-assisted LinkedIn content tool. Covers acceptable use, billing, AI-content responsibility, and liability.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <HomeNavbar />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: 16 May 2026</p>

        <Section title="1. Acceptance of these terms">
          <p>
            By creating a Cridl account or using the Cridl service at{" "}
            <a href="https://app.cridl.com" className="text-blue-600 underline">
              https://app.cridl.com
            </a>
            , you agree to these Terms of Service. If you do not agree, please do
            not use the service.
          </p>
        </Section>

        <Section title="2. What Cridl does">
          <p>
            Cridl is an AI-assisted tool for drafting, scheduling, and publishing
            posts on LinkedIn. Publishing requires you to connect your own LinkedIn
            account via the standard LinkedIn OAuth flow — Cridl publishes only on
            your behalf and only when you explicitly click &ldquo;Post now&rdquo;
            or set a scheduled time. Cridl is not affiliated with, endorsed by, or
            sponsored by LinkedIn Corporation.
          </p>
        </Section>

        <Section title="3. Eligibility">
          <p>
            You must be at least 18 years old to use Cridl. If you use Cridl on
            behalf of a company or other organisation, you confirm that you have the
            authority to bind that entity to these terms.
          </p>
        </Section>

        <Section title="4. Account responsibility">
          <p>
            You are responsible for keeping your Cridl and LinkedIn credentials
            confidential and for any activity that happens under your account. You
            are responsible for the content you publish via Cridl — including
            ensuring it is accurate, lawful, and consistent with LinkedIn&apos;s
            own User Agreement and Professional Community Policies.
          </p>
        </Section>

        <Section title="5. Acceptable use">
          <p>You agree not to use Cridl to:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1.5">
            <li>publish illegal, defamatory, harassing, or hateful content;</li>
            <li>send spam or run automated mass-posting beyond the service&apos;s plan-based rate limits;</li>
            <li>impersonate any person or organisation;</li>
            <li>infringe anyone&apos;s intellectual property, privacy, or other rights;</li>
            <li>circumvent LinkedIn&apos;s own platform rules — including any restriction LinkedIn places on automation, scraping, or scope use;</li>
            <li>reverse-engineer, resell, or sublicense the Cridl service.</li>
          </ul>
          <p className="mt-2">
            Cridl may suspend or terminate accounts that violate this section,
            with or without notice, and may remove content that violates these
            terms or applicable law.
          </p>
        </Section>

        <Section title="6. Subscriptions, billing, and refunds">
          <p>
            Cridl offers a free tier and paid tiers (Starter, Pro, Business). Paid
            subscriptions are processed by Razorpay on a recurring monthly basis
            and auto-renew until you cancel. You can cancel at any time from your
            account; cancellation stops future renewals but does not refund the
            current billing period. Refunds for partial periods are not provided
            except where required by applicable law. All prices are quoted in INR
            unless otherwise stated and exclude any applicable taxes.
          </p>
        </Section>

        <Section title="7. AI-generated content">
          <p>
            Cridl uses third-party AI models (provided via OpenRouter and fal.ai)
            to draft post text and generate images. AI output can be incorrect,
            non-original, or unsuitable for your context. You are responsible for
            reviewing every piece of AI-generated content before publishing it,
            for verifying any factual claims, and for ensuring you have the rights
            to publish it. Cridl makes no warranty that AI outputs are factual,
            original, or non-infringing. You retain ownership of the content you
            publish through Cridl.
          </p>
        </Section>

        <Section title="8. Dependency on LinkedIn">
          <p>
            The Cridl service depends entirely on LinkedIn&apos;s APIs and
            developer-platform policies. Cridl features may change, be reduced, or
            stop working if LinkedIn modifies their platform, deprecates an
            endpoint, restricts a scope, rate-limits our app, or revokes
            credentials. Cridl is not liable for any LinkedIn-side failure
            including but not limited to API errors, scope restrictions (such as
            Marketing Developer Platform partner-approval gating on the{" "}
            <code>w_organization_social</code> scope), rate limits, or LinkedIn
            account suspensions.
          </p>
        </Section>

        <Section title="9. Intellectual property">
          <p>
            Cridl, the Cridl name and logo, and the software, prompts, and other
            materials that make up the service are owned by Cridl and protected by
            applicable law. You may not copy, modify, distribute, or create
            derivative works of the service except as expressly permitted by
            these terms. Content you draft and publish through Cridl belongs to
            you.
          </p>
        </Section>

        <Section title="10. Disclaimers">
          <p>
            The Cridl service is provided &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; without warranties of any kind, whether express or
            implied — including any implied warranty of merchantability, fitness
            for a particular purpose, non-infringement, or uninterrupted
            availability. We do not warrant that the service will be error-free,
            secure against every threat, or that any defect will be corrected.
          </p>
        </Section>

        <Section title="11. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Cridl&apos;s total liability
            for any claim arising out of or relating to the service is limited to
            the amount you actually paid Cridl in the twelve months immediately
            preceding the event giving rise to the claim. Cridl is not liable for
            any indirect, incidental, special, consequential, or punitive damages
            — including loss of profits, loss of data, loss of goodwill, or
            business interruption — even if advised of the possibility.
          </p>
        </Section>

        <Section title="12. Termination">
          <p>
            You may stop using Cridl at any time and may delete your account from
            Settings. Cridl may suspend or terminate your account for violation of
            these terms, non-payment, or where required by law. On termination,
            your data is deleted within 30 days as described in our{" "}
            <a href="/privacy" className="text-blue-600 underline">
              Privacy Policy
            </a>
            .
          </p>
        </Section>

        <Section title="13. Changes to these terms">
          <p>
            We may update these terms from time to time. Material changes will be
            notified by email before they take effect. Continued use of Cridl after
            the effective date of an update means you accept the updated terms.
          </p>
        </Section>

        <Section title="14. Governing law and disputes">
          <p>
            These terms are governed by the laws of India. Any dispute arising out
            of or relating to these terms or the Cridl service will be subject to
            the exclusive jurisdiction of the courts at our registered place of
            business in India.
          </p>
        </Section>

        <Section title="15. Contact">
          <p>
            For any question about these terms, email{" "}
            <a href="mailto:support@cridl.app" className="text-blue-600 underline">
              support@cridl.app
            </a>
            .
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

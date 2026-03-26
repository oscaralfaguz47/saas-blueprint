// app/terms/page.tsx (or wherever your route lives)
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

const LAST_UPDATED = "2026-02-19"; // update when you change these terms

export default async function TermsPage() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session?.user;

  return (
    <main
      className="min-h-screen bg-(--marketing-legal-bg)"
      style={{ backgroundColor: "var(--marketing-legal-bg, #0f1117)" }}
    >
      {/* Header */}
      <header
        className="border-b border-(--border-subtle) bg-(--bg-main)"
        style={{ backgroundColor: "var(--bg-main, #0f1117)" }}
      >
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="grid h-9 w-9 place-items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface)"
              >
                <span className="text-xs font-semibold text-(--text-primary)">ATL</span>
              </Link>
              <Link href="/" className="text-sm font-medium text-(--text-primary)">
                ATL
              </Link>
            </div>
            <nav className="flex items-center gap-3">
              <Link
                href="/help"
                className="text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Get in touch
              </Link>
              <Link
                href="/"
                className="text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Home
              </Link>
              <Link
                href="/pricing"
                className="hidden text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary) md:inline"
              >
                Pricing
              </Link>
              <Link
                href="/privacy"
                className="hidden text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary) md:inline"
              >
                Privacy
              </Link>
              <Link
                href={isLoggedIn ? "/app/requests" : "/auth/sign-in"}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                {isLoggedIn ? "Go to app" : "Sign in"}
              </Link>
            </nav>
          </div>
        </Container>
      </header>

      {/* Content */}
      <section className="py-16 md:py-24">
        <Container>
          <div className="mx-auto max-w-3xl rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8 shadow-sm md:p-12">
            <h1 className="text-3xl font-semibold text-(--text-primary) md:text-4xl">
              Terms of Service
            </h1>

            <p className="mt-4 text-sm text-(--text-muted)">
              Last updated: {LAST_UPDATED}
            </p>

            <div className="mt-10 space-y-8 text-base leading-relaxed text-(--text-secondary)">
              <p>
                These Terms of Service (&quot;Terms&quot;) govern your access to
                and use of ATL (the &quot;Service&quot;). By creating an account,
                accessing, or using the Service, you agree to these Terms.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                1. The Service (B2B SaaS)
              </h2>
              <p>
                ATL is a subscription-based B2B SaaS platform that helps
                organizations manage internal approval workflows, attach
                supporting evidence, and maintain audit-ready documentation and
                logs. The Service does not process payments on your behalf, hold
                funds, or provide financial services.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                2. Accounts, workspaces, and responsibilities
              </h2>
              <p>
                You are responsible for all activity under your account and
                within your workspace(s), including user access, permissions,
                and content you upload or share. You must use the Service in
                compliance with applicable laws and these Terms.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                3. Customer Content and External Approvers
              </h2>
              <p>
                You retain ownership of your content (records, attachments, and
                other materials) submitted to the Service (&quot;Customer
                Content&quot;). External approvers may receive secure, tokenized
                links that show only the information you choose to share. You
                are responsible for ensuring recipients are authorized to view
                shared information.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                4. Acceptable use
              </h2>
              <p>
                You agree not to misuse the Service, including attempting
                unauthorized access, probing or scanning security, uploading
                malicious files, or using the Service in a way that violates
                laws or third-party rights. We may suspend or terminate access
                to protect the Service, users, and third parties.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                5. Subscriptions, billing, and taxes
              </h2>
              <p>
                Paid plans are billed in advance on a recurring basis (e.g.,
                monthly). Subscription fees, applicable taxes, and billing
                details are presented at checkout. Billing may be handled by a
                Merchant of Record/payment provider (e.g., Paddle), which may
                calculate and collect taxes and provide invoices/receipts under
                its policies.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Auto-renewal:</strong> Your subscription renews
                  automatically unless you cancel before the end of the current
                  billing period.
                </li>
                <li>
                  <strong>Cancellation:</strong> You can cancel at any time from
                  your workspace billing settings. Cancellation takes effect at
                  the end of the current billing period unless otherwise stated
                  at checkout.
                </li>
                <li>
                  <strong>Plan changes:</strong> Upgrades/downgrades may take
                  effect immediately or at the next billing period depending on
                  the plan and provider rules.
                </li>
              </ul>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                6. Refund Policy
              </h2>
              <p>
                Unless required by law or explicitly stated at checkout, fees
                for subscription periods are generally <strong>non-refundable</strong>.
                If you believe you were billed in error, please contact us
                within <strong>14 days</strong> of the charge and we will review
                the request. Approved refunds (if any) will be processed via the
                original payment method and may take several business days to
                appear, depending on your bank/payment provider.
              </p>
              <p>
                If billing is handled by a Merchant of Record (e.g., Paddle),
                refunds may be subject to that provider’s refund and dispute
                policies and processing timelines.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                7. Availability and changes to the Service
              </h2>
              <p>
                We may modify, update, or discontinue features of the Service.
                We strive to provide a reliable service, but we do not guarantee
                uninterrupted availability.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                8. Disclaimer
              </h2>
              <p>
                The Service is provided on an &quot;as is&quot; and &quot;as
                available&quot; basis. To the maximum extent permitted by law,
                we disclaim all warranties, express or implied, including
                merchantability, fitness for a particular purpose, and
                non-infringement.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                9. Limitation of liability
              </h2>
              <p>
                To the maximum extent permitted by law, ATL will not be liable
                for any indirect, incidental, special, consequential, or
                punitive damages, or any loss of profits, revenues, data, or
                goodwill, arising out of or related to your use of the Service.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                10. Termination.
              </h2>
              <p>
                You may stop using the Service at any time. We may suspend or
                terminate access if you violate these Terms, pose a security
                risk, or if required by law. Upon termination, your access may
                end, and your data may be handled according to our Privacy
                Policy and retention practices.
              </p>

              <h2 className="text-lg font-semibold text-(--text-primary)">
                11. Contact
              </h2>
              <p>
                Questions about these Terms can be sent to{" "}
                <strong>support@PENDING_DOMAIN.com</strong>.
              </p>

            </div>
          </div>
        </Container>
      </section>

      {/* Footer */}
      <footer
        className="border-t border-(--border-subtle) bg-(--bg-main)"
        style={{ backgroundColor: "var(--bg-main, #0f1117)" }}
      >
        <Container>
          <div className="flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-(--text-muted)">
              © {new Date().getFullYear()} ATL. All rights reserved.
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Link
                href="/privacy"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Privacy
              </Link>
              <Link
                href="/pricing"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Pricing
              </Link>
              <Link
                href="/auth/sign-in"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Sign in
              </Link>
            </div>
          </div>
        </Container>
      </footer>
    </main>
  );
}

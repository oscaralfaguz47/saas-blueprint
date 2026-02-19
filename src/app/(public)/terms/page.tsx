// app/terms/page.tsx (or wherever your route lives)
import Link from "next/link";
import { Container } from "@/components/ui/container";

const LAST_UPDATED = "2026-02-19"; // update when you change these terms

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-(--bg-main)">
      {/* Header */}
      <header className="border-b border-(--border-subtle) bg-(--bg-main)">
        <Container>
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="text-sm font-medium text-(--text-primary)">
              ATL
            </Link>

            <nav className="flex items-center gap-6 text-sm">
              <Link
                href="/pricing"
                className="text-(--text-secondary) hover:text-(--text-primary)"
              >
                Pricing
              </Link>
              <Link
                href="/privacy"
                className="text-(--text-secondary) hover:text-(--text-primary)"
              >
                Privacy
              </Link>
              <Link
                href="/auth/sign-in"
                className="text-(--text-secondary) hover:text-(--text-primary)"
              >
                Sign in
              </Link>
            </nav>
          </div>
        </Container>
      </header>

      {/* Content */}
      <section>
        <Container>
          <div className="py-16 max-w-3xl">
            <h1 className="text-3xl font-semibold text-(--text-primary)">
              Terms of Service
            </h1>

            <p className="mt-4 text-sm text-(--text-muted)">
              Last updated: {LAST_UPDATED}
            </p>

            <div className="mt-8 space-y-6 text-sm leading-relaxed text-(--text-secondary)">
              <p>
                These Terms of Service (&quot;Terms&quot;) govern your access to
                and use of ATL (the &quot;Service&quot;). By creating an account,
                accessing, or using the Service, you agree to these Terms.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                1. The Service (B2B SaaS)
              </h2>
              <p>
                ATL is a subscription-based B2B SaaS platform that helps
                organizations manage internal approval workflows, attach
                supporting evidence, and maintain audit-ready documentation and
                logs. The Service does not process payments on your behalf, hold
                funds, or provide financial services.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                2. Accounts, workspaces, and responsibilities
              </h2>
              <p>
                You are responsible for all activity under your account and
                within your workspace(s), including user access, permissions,
                and content you upload or share. You must use the Service in
                compliance with applicable laws and these Terms.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
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

              <h2 className="text-base font-semibold text-(--text-primary)">
                4. Acceptable use
              </h2>
              <p>
                You agree not to misuse the Service, including attempting
                unauthorized access, probing or scanning security, uploading
                malicious files, or using the Service in a way that violates
                laws or third-party rights. We may suspend or terminate access
                to protect the Service, users, and third parties.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
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

              <h2 className="text-base font-semibold text-(--text-primary)">
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

              <h2 className="text-base font-semibold text-(--text-primary)">
                7. Availability and changes to the Service
              </h2>
              <p>
                We may modify, update, or discontinue features of the Service.
                We strive to provide a reliable service, but we do not guarantee
                uninterrupted availability.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                8. Disclaimer
              </h2>
              <p>
                The Service is provided on an &quot;as is&quot; and &quot;as
                available&quot; basis. To the maximum extent permitted by law,
                we disclaim all warranties, express or implied, including
                merchantability, fitness for a particular purpose, and
                non-infringement.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                9. Limitation of liability
              </h2>
              <p>
                To the maximum extent permitted by law, ATL will not be liable
                for any indirect, incidental, special, consequential, or
                punitive damages, or any loss of profits, revenues, data, or
                goodwill, arising out of or related to your use of the Service.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                10. Termination.
              </h2>
              <p>
                You may stop using the Service at any time. We may suspend or
                terminate access if you violate these Terms, pose a security
                risk, or if required by law. Upon termination, your access may
                end, and your data may be handled according to our Privacy
                Policy and retention practices.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
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
      <footer className="border-t border-(--border-subtle) bg-(--bg-main)">
        <Container>
          <div className="py-8 text-sm text-(--text-muted)">
            © {new Date().getFullYear()} ATL. All rights reserved.
          </div>
        </Container>
      </footer>
    </main>
  );
}

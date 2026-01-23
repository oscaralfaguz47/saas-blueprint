import Link from "next/link";
import { Container } from "@/components/ui/container";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-(--bg-main)">
      {/* Header */}
      <header className="border-b border-(--border-subtle) bg-(--bg-main)">
        <Container>
          <div className="flex h-16 items-center justify-between">
            <Link
              href="/"
              className="text-sm font-medium text-(--text-primary)"
            >
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
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <div className="mt-8 space-y-6 text-sm leading-relaxed text-(--text-secondary)">
              <p>
                These Terms of Service govern your access to and use of ATL
                (“the Service”). By using the Service, you agree to these terms.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                Use of the Service
              </h2>
              <p>
                You may use the Service only in compliance with these terms and
                all applicable laws. You are responsible for all activity
                occurring under your account and workspaces.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                Records and Approvals
              </h2>
              <p>
                ATL provides tools to create records, attach evidence, and send
                approval requests. ATL does not make decisions on your behalf and
                does not guarantee external responses.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                External Approvers
              </h2>
              <p>
                External approvers access records via secure, tokenized links.
                You are responsible for ensuring that recipients are authorized
                to view the information shared.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                Availability and Changes
              </h2>
              <p>
                We may modify or discontinue the Service at any time. We are not
                liable for any interruption or loss of access.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                Limitation of Liability
              </h2>
              <p>
                The Service is provided “as is”. To the maximum extent permitted
                by law, ATL shall not be liable for indirect, incidental, or
                consequential damages.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                Contact
              </h2>
              <p>
                If you have questions about these terms, please contact us at
                support@yourdomain.com.
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

import Link from "next/link";
import { Container } from "@/components/ui/container";

export default function PrivacyPage() {
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
                href="/terms"
                className="text-(--text-secondary) hover:text-(--text-primary)"
              >
                Terms
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
              Privacy Policy
            </h1>

            <p className="mt-4 text-sm text-(--text-muted)">
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <div className="mt-8 space-y-6 text-sm leading-relaxed text-(--text-secondary)">
              <p>
                This Privacy Policy explains how ATL collects, uses, and protects
                your information when you use the Service.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                Information We Collect
              </h2>
              <p>
                We collect information you provide directly, such as email
                addresses, workspace data, records, evidence files, and approval
                actions.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                How We Use Information
              </h2>
              <p>
                Information is used solely to operate, secure, and improve the
                Service, including authentication, approvals, notifications,
                and audit trails.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                External Approvers
              </h2>
              <p>
                External approvers only see the information explicitly shared
                with them via secure links. Links expire and can be revoked by
                internal users.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                Data Security
              </h2>
              <p>
                We implement reasonable technical and organizational measures to
                protect your data. However, no system is 100% secure.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                Data Retention
              </h2>
              <p>
                Data is retained according to your plan and workspace settings.
                You may delete records or cancel your subscription at any time.
              </p>

              <h2 className="text-base font-semibold text-(--text-primary)">
                Contact
              </h2>
              <p>
                If you have questions about this Privacy Policy, contact us at
                privacy@yourdomain.com.
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

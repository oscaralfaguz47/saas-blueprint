import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import AuthCard from "@/components/auth/auth-card";
import LinkAccountForm from "./link-account-form";

const CHALLENGE_TTL_MS = 15 * 60 * 1000;

type Props = {
  searchParams?: Promise<{ challenge?: string }>;
};

export default async function LinkAccountPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawToken = params?.challenge?.trim();
  if (!rawToken) {
    return (
      <AuthCard
        title="Link account"
        message={{
          tone: "error",
          title: "Invalid link",
          description: "This link is missing the required information. Please start the sign-in process again.",
          code: "MissingChallenge",
        }}
      >
        <a
          href="/api/link/clear-cookie?redirect=/auth/sign-in"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) hover:bg-(--bg-surface-elev)"
        >
          Back to sign in
        </a>
      </AuthCard>
    );
  }

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const challenge = await prisma.authLinkChallenge.findUnique({
    where: { tokenHash },
    select: { id: true, expiresAt: true, consumedAt: true, email: true },
  });

  const now = new Date();
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) {
    return (
      <AuthCard
        title="Link account"
        message={{
          tone: "error",
          title: challenge?.consumedAt ? "Already used" : "Link expired or invalid",
          description: challenge?.consumedAt
            ? "This link has already been used. You can sign in with Microsoft now."
            : "This link has expired or is invalid. Please try signing in with Microsoft again to get a new link.",
          code: "InvalidChallenge",
        }}
      >
        <a
          href="/api/link/clear-cookie?redirect=/auth/sign-in"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) hover:bg-(--bg-surface-elev)"
        >
          Back to sign in
        </a>
      </AuthCard>
    );
  }

  const appName = process.env.APP_NAME?.trim() || "Relitrue";
  return (
    <AuthCard
      title="Link your Microsoft account"
      subtitle={`We found an existing ${appName} account for this email. To protect your account, we'll send you a magic link to confirm and link your Microsoft account.`}
    >
      <LinkAccountForm challengeToken={rawToken} />
    </AuthCard>
  );
}

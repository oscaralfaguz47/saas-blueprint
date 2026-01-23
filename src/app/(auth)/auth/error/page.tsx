import Link from "next/link";
import AuthCard from "@/components/auth/auth-card";
import { getAuthErrorCopy } from "@/lib/auth-errors";

type Props = {
  searchParams?: {
    error?: string;
    callbackUrl?: string;
  };
};

export default function AuthErrorPage({ searchParams }: Props) {
  const copy = getAuthErrorCopy(searchParams?.error);

  return (
    <AuthCard
      title={copy.title}
      subtitle={copy.description}
      badgeText="Secure"
      message={{
        tone: "error",
        title: copy.title,
        description: copy.description,
        code: copy.code,
      }}
    >
      <div className="space-y-3">
        <Link
          href="/auth/sign-in"
          className="inline-flex w-full items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-black/90"
        >
          Back to sign in
        </Link>

        <p className="text-xs text-black/45">
          If the problem continues, please contact support.
        </p>
      </div>
    </AuthCard>
  );
}

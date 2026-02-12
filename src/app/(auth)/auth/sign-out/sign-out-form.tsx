"use client";

import { useEffect, useState } from "react";
import { getCsrfToken } from "next-auth/react";
import { Spinner } from "@/components/ui/spinner";

type SignOutFormProps = {
  callbackUrl: string;
  buttonLabel: string;
};

export default function SignOutForm({ callbackUrl, buttonLabel }: SignOutFormProps) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    getCsrfToken().then((token) => setCsrfToken(token ?? null));
  }, []);

  if (!csrfToken) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <form action="/api/auth/signout" method="POST" className="mt-6">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button
        type="submit"
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

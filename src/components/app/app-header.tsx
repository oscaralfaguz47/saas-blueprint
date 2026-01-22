"use client";

import { signOut } from "next-auth/react";

type AppHeaderProps = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

function initialsFrom(nameOrEmail: string | null) {
  if (!nameOrEmail) return "U";
  const s = nameOrEmail.trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AppHeader({ user }: AppHeaderProps) {
  const label = user.name || user.email || "User";
  const initials = initialsFrom(user.name || user.email);

  async function handleSignOut() {
    // Te manda a la landing pública
    await signOut({ callbackUrl: "/" });
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold">YourApp</div>
          <div className="text-xs text-gray-500">/app</div>
        </div>

        <div className="flex items-center gap-3">
          {/* Avatar */}
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt="Profile"
              className="h-9 w-9 rounded-full border object-cover"
            />
          ) : (
            <div className="h-9 w-9 rounded-full border flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
          )}

          {/* User label */}
          <div className="hidden sm:block">
            <div className="text-sm font-medium leading-4">{label}</div>
            {user.email ? (
              <div className="text-xs text-gray-500">{user.email}</div>
            ) : null}
          </div>

          <button
            onClick={handleSignOut}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            type="button"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

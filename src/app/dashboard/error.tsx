"use client";

export default function DashboardError({ error }: { error: Error }) {
  const isForbidden = error.message === "FORBIDDEN";

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">{isForbidden ? "403 Forbidden" : "Error"}</h1>
      <p className="mt-2">
        {isForbidden ? "You do not have permission to view this page." : error.message}
      </p>
    </main>
  );
}

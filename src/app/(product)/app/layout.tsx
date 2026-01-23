import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import AppHeader from "@/components/app/app-header";
import { Container } from "@/components/ui/container";
import { ThemeProvider } from "@/components/theme/theme-provider";
import ThemeBootstrap from "@/components/theme/theme-bootstrap";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  return (
    <>
      {/* Applies theme ONLY inside /app, based on localStorage */}
      <ThemeBootstrap />

      <ThemeProvider>
        <div className="min-h-screen bg-(--bg-app)">
          <AppHeader
            user={{
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              image: session.user.image ?? null,
            }}
          />

         <main className="py-8 text-(--text-primary)">
            <Container>
              <div className="max-w-5xl">{children}</div>
            </Container>
          </main>
        </div>
      </ThemeProvider>
    </>
  );
}

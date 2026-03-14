import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import ThemeBootstrap from "@/components/theme/theme-bootstrap";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SaaS Blueprint",
  description: "SaaS Blueprint",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  /* suppressHydrationWarning: reduces hydration errors when extensions modify the DOM (see: incognito vs normal window). */
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeBootstrap />
        <div id="__app-root" suppressHydrationWarning>
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}

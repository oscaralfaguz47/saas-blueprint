import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import Providers from "./providers";
import { SessionProviderShell } from "./session-provider-shell";
import { OAuthPopupDetector } from "@/components/auth/oauth-popup-detector";
import { ChatWidgetRoot } from "@/components/help/chat-widget-root";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SaaS Blueprint",
  description: "SaaS Blueprint",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? "";

  /* suppressHydrationWarning: reduces hydration errors when extensions modify the DOM (see: incognito vs normal window). */
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{var p=location.pathname,a=p.startsWith('/app')||p.startsWith('/admin'),s=a&&localStorage.getItem('atl.theme.app'),t=s==='light'||s==='dark'||s==='system'?s:'dark';document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}`,
          }}
        />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
      try {
        if (window.opener && !window.opener.closed) {
          document.documentElement.style.visibility = 'visible';
          document.documentElement.style.background = '#0f1117';
          
          var style = document.createElement('style');
          style.textContent = [
            '@keyframes spin { to { transform: rotate(360deg); } }',
            '@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }',
            '#oauth-popup-loader {',
            '  position: fixed; inset: 0; z-index: 9999;',
            '  background: #0f1117;',
            '  display: flex; flex-direction: column;',
            '  align-items: center; justify-content: center; gap: 16px;',
            '  animation: fadeIn 0.2s ease forwards;',
            '}',
            '#oauth-popup-loader .spinner {',
            '  width: 36px; height: 36px;',
            '  border: 3px solid rgba(255,255,255,0.1);',
            '  border-top-color: rgba(255,255,255,0.7);',
            '  border-radius: 50%;',
            '  animation: spin 0.8s linear infinite;',
            '}',
            '#oauth-popup-loader p {',
            '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
            '  font-size: 14px;',
            '  color: rgba(255,255,255,0.4);',
            '  margin: 0;',
            '}',
          ].join('');
          document.head.appendChild(style);

          var loader = document.createElement('div');
          loader.id = 'oauth-popup-loader';
          loader.innerHTML = '<div class="spinner"></div><p>Completing sign-in...</p>';
          
          document.addEventListener('DOMContentLoaded', function() {
            document.body.appendChild(loader);
          });
        }
      } catch(e) {}
    `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <SessionProviderShell>
          <div id="__app-root" suppressHydrationWarning>
            <Suspense fallback={null}>
              <OAuthPopupDetector />
            </Suspense>
            <Providers>{children}</Providers>
          </div>
        </SessionProviderShell>
        <SessionProviderShell>
          <ChatWidgetRoot />
        </SessionProviderShell>
      </body>
    </html>
  );
}

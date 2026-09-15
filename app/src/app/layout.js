import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "material-symbols/outlined.css";
import "./globals.css";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import "@/lib/network/initOutboundProxy"; // Auto-initialize outbound proxy env
import "@/shared/services/bootstrap"; // Auto-run initializeApp (watchdog, auto-resume tunnel)
import { initConsoleLogCapture } from "@/lib/consoleLogBuffer";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";

// Hook console immediately at module load time (server-side only, runs once)
initConsoleLogCapture();

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "ZRouter - AI Infrastructure Management",
  description: "One endpoint for all your AI providers. Manage keys, monitor usage, and scale effortlessly.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply persisted theme before first paint so a reload does not flash the
            default (light) theme before the client store hydrates. Mirrors the
            zustand-persist "theme" key and the applyTheme()/applyColorTheme()
            the client store runs on init. COLOR_THEMES is duplicated inline to
            keep this script dependency-free (same list as src/lib/colorThemes.js). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme');var d=s?(JSON.parse(s).state||{}):{};var t=d.theme||'system';var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t==='system'&&m)){document.documentElement.classList.add('dark')}var THEMES={itms:'#033f7b',coral:'#e54d5e',blue:'#3b82f6',red:'#ef4444',green:'#22c55e',violet:'#8b5cf6',orange:'#f97316',cyan:'#06b6d4'};function hx(c){c=(c||'').trim();if(c[0]!=='#')c='#'+c;return /^#([0-9a-fA-F]{6})$/.test(c)?c.toLowerCase():null}function shade(h,p){h=h.slice(1);var t=function(x){var n=parseInt(h.slice(x,x+2),16);var a=Math.round(((p<0?0:255)-n)*Math.abs(p));var v=p<0?n-a:n+a;return Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')};return '#'+t(0)+t(2)+t(4)}var base=hx(d.customColor)||THEMES[d.colorTheme]||THEMES.itms;var r=document.documentElement;r.style.setProperty('--color-primary',base);r.style.setProperty('--color-primary-hover',shade(base,-0.14))}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `var d=document,r=d.documentElement,f=function(){r.classList.add('fonts-loaded')};if(d.fonts&&d.fonts.load){d.fonts.load('24px "Material Symbols Outlined"').then(f).catch(f);setTimeout(f,3000)}else{f()}`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <RuntimeI18nProvider>
            {children}
          </RuntimeI18nProvider>
        </ThemeProvider>
        <GoogleAnalytics gaId={"G-LC959F603F"} />
      </body>
    </html>
  );
}

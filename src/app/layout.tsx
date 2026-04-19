import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/context/auth";
import { ThemeProvider } from "@/lib/context/theme";
import SplashHider from "@/components/SplashHider";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cridl — LinkedIn Automation",
  description: "AI-powered LinkedIn content for personal branding and corporate growth.",
  // PWA / mobile meta
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cridl",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",   // extends into notch area, safe-area CSS handles padding
  },
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={dmSans.variable}>
      <head>
        {/* DNS + TLS pre-warmed before any API calls fire */}
        <link rel="preconnect" href="https://openrouter.ai" />
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://storage.googleapis.com" />
        <link rel="dns-prefetch" href="https://api.linkedin.com" />
        <link rel="dns-prefetch" href="https://media.licdn.com" />
      </head>
      <body className="antialiased selection:bg-primary/20 selection:text-primary">
        <ThemeProvider>
          <AuthProvider>
            <SplashHider />
            {children}
          </AuthProvider>
        </ThemeProvider>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}

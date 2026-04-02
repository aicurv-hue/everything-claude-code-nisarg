import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/context/auth";
import SplashHider from "@/components/SplashHider";

// Plus Jakarta Sans — closest free alternative to OpenAI Sans / Söhne
// Used for the image hook overlay text to match premium tech brand aesthetic
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],  // dropped 800 — saves one font file
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LinkAuto — LinkedIn Automation",
  description: "AI-powered LinkedIn content for personal branding and corporate growth.",
  // PWA / mobile meta
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LinkAuto",
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
    <html lang="en" className={plusJakarta.variable}>
      <head>
        {/* DNS + TLS pre-warmed before any API calls fire */}
        <link rel="preconnect" href="https://openrouter.ai" />
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://storage.googleapis.com" />
        <link rel="dns-prefetch" href="https://api.linkedin.com" />
        <link rel="dns-prefetch" href="https://media.licdn.com" />
      </head>
      <body className="antialiased selection:bg-primary/20 selection:text-primary">
        <AuthProvider>
          <SplashHider />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

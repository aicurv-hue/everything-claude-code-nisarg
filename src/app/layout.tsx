import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinkAuto — LinkedIn Automation",
  description: "AI-powered LinkedIn content for personal branding and corporate growth.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-primary/20 selection:text-primary">
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mandate — authority must not expand",
  description: "Agents can subcontract work. Authority must not expand.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${geist.variable} ${geistMono.variable} antialiased`}>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject attributes on <body> */}
      <body className="min-h-screen bg-bg text-ink" suppressHydrationWarning>
        <Nav />
        {children}
      </body>
    </html>
  );
}

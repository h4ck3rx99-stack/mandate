import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const dm = DM_Sans({ variable: "--font-dm", subsets: ["latin"], weight: ["400", "500"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mandate — authority must not expand",
  description: "Agents can subcontract work. Authority must not expand.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dm.variable} ${geistMono.variable} antialiased`}>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject attributes on <body> */}
      <body className="min-h-screen bg-bg text-ink" suppressHydrationWarning>
        <Nav />
        {children}
      </body>
    </html>
  );
}

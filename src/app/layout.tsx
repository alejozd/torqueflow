import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TorqueFlow",
  description: "Plataforma SaaS multi-tenant para gestión de talleres/servitecas.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Opts every page into dynamic rendering: the CSP nonce (src/proxy.ts) only
  // exists per request, so a page prerendered at build time would ship
  // scripts without it and be blocked by the browser.
  await connection();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

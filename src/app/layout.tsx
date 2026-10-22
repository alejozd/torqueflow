import type { Metadata } from "next";
import { connection } from "next/server";
// Fuentes servidas desde el paquete (next/font/local por dentro): el build no
// depende de llegar a Google Fonts, que falló una vez desplegando en el servidor.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const geistSans = GeistSans;
const geistMono = GeistMono;

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

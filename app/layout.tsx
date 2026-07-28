import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { SiteHeader } from "@/components/SiteHeader";
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
  title: "Yasper — Mentoría de Traders",
  description: "Mentoría personalizada de Yasper: curso de trading y comunidad VIP para formar traders consistentes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark">
          <SiteHeader />

          <main className="flex-1">{children}</main>

          <footer className="border-t border-panel-border">
            <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-foreground/50 flex flex-col sm:flex-row justify-between gap-2">
              <span>© {new Date().getFullYear()} Yasper — Mentoría de Traders</span>
              <span>yaspertrader.com</span>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}

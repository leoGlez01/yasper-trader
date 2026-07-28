"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { CheckoutButton } from "./CheckoutButton";

const NAV_CTA_CLASSES =
  "inline-flex rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-gold-light sm:px-4 sm:py-2 sm:text-sm";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-panel-border bg-background/80 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] backdrop-blur-md"
          : "border-transparent bg-background/0"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="group flex items-center gap-3">
          <Image
            src="/brand/yasper-isotipo.jpg"
            alt="Yasper"
            width={36}
            height={36}
            className="rounded-md transition-transform duration-500 ease-out group-hover:rotate-6 group-hover:scale-105"
          />
          <span className="font-semibold tracking-wide text-gold-light">
            YASPER <span className="hidden text-foreground/60 sm:inline">· Mentoría de Traders</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <CheckoutButton className={NAV_CTA_CLASSES}>Comenzar</CheckoutButton>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ProductHeader({ brand, navigation, tools }: { brand: ReactNode; navigation: ReactNode; tools: ReactNode }) {
  const navRef = useRef<HTMLElement>(null);
  const lastActive = useRef<string | null>(null);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const href = active.getAttribute("href");
    if (href === lastActive.current) return;
    lastActive.current = href;
    const item = active.getBoundingClientRect();
    const frame = nav.getBoundingClientRect();
    if (item.left < frame.left || item.right > frame.right) {
      nav.scrollLeft += item.left - frame.left - (frame.width - item.width) / 2;
    }
  }, [navigation]);

  return (
    <header className="product-header">
      {brand}
      <nav ref={navRef} className="product-navigation" aria-label="Главная навигация">{navigation}</nav>
      <div className="product-header-tools">{tools}</div>
    </header>
  );
}

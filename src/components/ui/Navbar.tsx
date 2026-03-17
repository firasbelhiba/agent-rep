"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

const NAV_LINKS = [
  { href: "/agents", label: "Agents" },
  { href: "/register", label: "Register" },
  { href: "/connections", label: "Connections" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
  { href: "/architecture", label: "Architecture" },
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ displayName: string } | null>(null);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 10);
      // Hide on scroll down, show on scroll up (Hedera pattern)
      if (y > 200 && y > lastScrollY.current) {
        setHidden(true);
      } else {
        setHidden(false);
      }
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const readUser = () => {
      const userStr = localStorage.getItem("communityUser");
      if (userStr) {
        try { setUser(JSON.parse(userStr)); } catch {}
      } else {
        setUser(null);
      }
    };
    readUser();

    // Listen for storage changes (login/logout from other tabs or same-tab updates)
    window.addEventListener("storage", readUser);

    // Poll briefly to catch same-tab localStorage writes (e.g., after login)
    const interval = setInterval(readUser, 1000);

    return () => {
      window.removeEventListener("storage", readUser);
      clearInterval(interval);
    };
  }, [pathname]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-[9999] transition-all duration-300 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      } ${
        scrolled
          ? "bg-black/90 backdrop-blur-xl border-b border-white/[0.06]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-[1140px] mx-auto px-6 lg:px-[50px]">
        <div className="flex items-center justify-between h-[120px] md:h-[120px] h-[80px]">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/logo-trimmed.png"
              alt="AgentRep"
              className="shrink-0 h-[36px] w-auto object-contain"
            />
          </Link>

          {/* Desktop Nav — Hedera style: 14px, gap-8, light weight */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative text-[14px] font-normal py-6 transition-colors duration-200 ${
                    isActive
                      ? "text-white"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-4 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#b47aff]" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/[0.15]">
              <span className="w-1.5 h-1.5 bg-[#b47aff] rounded-full animate-pulse" />
              <span className="text-[12px] text-white/60 font-normal">Testnet</span>
            </div>
            <Link
              href="/login"
              className="px-6 py-[9px] text-[14px] font-normal rounded-[36px] bg-[#8259ef] hover:bg-[#6d45d9] text-white transition-all duration-200"
            >
              {user ? user.displayName : "Connect"}
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-white/60 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu — Hedera gradient style */}
      {mobileOpen && (
        <div className="md:hidden bg-gradient-to-b from-black to-[#1a1452] border-t border-white/[0.06] px-6 py-6 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`block px-4 py-3 rounded-[10px] text-[15px] font-normal ${
                pathname === link.href ? "text-white bg-white/[0.06]" : "text-white/70 hover:text-white hover:bg-white/[0.03]"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setMobileOpen(false)}
            className="block mt-4 px-6 py-[13px] rounded-[42px] text-[15px] font-normal text-center bg-[#8259ef] text-white"
          >
            {user ? user.displayName : "Connect Wallet"}
          </Link>
        </div>
      )}
    </nav>
  );
}

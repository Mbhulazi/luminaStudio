"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/sample", label: "See a sample" },
  { href: "/pricing", label: "Pricing" },
  { href: "/workspace", label: "Workspace" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close account dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = user
    ? user.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()
    : "";

  return (
    <nav id="mainNav">
      <Link href="/" className="logo">Lummina <span>Studio</span></Link>

      <div className="nav-links">
        {NAV_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link ${pathname === l.href ? "active-nav" : ""}`}
          >
            {l.label}
          </Link>
        ))}

        {user ? (
          <div className="nav-dropdown-wrap" ref={accountRef} style={{ position: "relative" }}>
            <button
              className="nav-link nav-dropdown-trigger nav-account-trigger"
              onClick={() => setAccountOpen((o) => !o)}
              aria-expanded={accountOpen}
            >
              <span className="nav-avatar">{initials}</span>
              <span className="nav-caret">▾</span>
            </button>
            {accountOpen && (
              <div className="account-dropdown" style={{ opacity: 1, visibility: "visible" }}>
                <div className="ad-user">
                  <div className="ad-name">{user.name}</div>
                  <div className="ad-tier">{user.tier}</div>
                </div>
                <div className="td-divider" />
                <Link
                  href="/dashboard"
                  className="ad-item"
                  onClick={() => setAccountOpen(false)}
                >
                  My portfolio
                </Link>
                <Link
                  href="/pricing"
                  className="ad-item"
                  onClick={() => setAccountOpen(false)}
                >
                  Plan &amp; billing
                </Link>
                <button
                  className="ad-item ad-logout"
                  onClick={() => {
                    setAccountOpen(false);
                    logout();
                    router.push("/");
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: ".9rem" }}>
            <Link href="/auth" className="nav-link">Log in</Link>
            <Link href="/auth?mode=signup" className="nav-cta">Begin free →</Link>
          </div>
        )}
      </div>

      <button
        className="nav-mobile-menu"
        aria-label="Menu"
        style={{ display: "none" }}
        onClick={() => setMobileOpen((o) => !o)}
      >
        <span></span><span></span><span></span>
      </button>
    </nav>
  );
}

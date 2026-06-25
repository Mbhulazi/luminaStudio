import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "../styles/lumina.css";
import { AuthProvider } from "@/lib/auth-context";
import Nav from "@/components/Nav";
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lummina Studio — Atelier-grade portrait analysis",
  description:
    "Real, measured portrait analysis for oil painters. Value structure, composition, palette, and edges — computed from your image, with grounded mentor critique.",
};

// Intentionally permissive viewport: the original HTML pinned maximum-scale=1,
// which violates WCAG by disabling pinch-zoom. We allow zoom to 5x.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${dmSans.variable}`}>
      <body>
        <AuthProvider>
          <Nav />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

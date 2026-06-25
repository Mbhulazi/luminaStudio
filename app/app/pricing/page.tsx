import Link from "next/link";

const PLANS = [
  {
    tier: "free" as const,
    name: "Free",
    priceUsd: 0,
    tagline: "For trying the tools",
    features: [
      "3 analyses per month",
      "Full value map & composition",
      "Palette extraction",
      "Grisaille & Notan study tool",
    ],
    cta: "Current plan",
    href: "/auth?mode=signup",
    featured: false,
  },
  {
    tier: "atelier" as const,
    name: "Atelier",
    priceUsd: 15,
    tagline: "For serious practice",
    features: [
      "50 analyses per month",
      "All six analysis modules",
      "PDF & TIFF study export",
      "Saved palette archive",
      "Progress tracking",
    ],
    cta: "Choose Atelier",
    href: "/checkout?plan=atelier",
    featured: true,
  },
  {
    tier: "master" as const,
    name: "Master",
    priceUsd: 32,
    tagline: "For professionals",
    features: [
      "1,000 analyses per month",
      "Everything in Atelier",
      "High-resolution exports",
      "Comparison views",
      "Priority queue",
    ],
    cta: "Choose Master",
    href: "/checkout?plan=master",
    featured: false,
  },
];

const FAQ = [
  {
    q: "Are the grades really computed from my image?",
    a: "Yes — every numeric value (value grade, edge ratios, palette shares, composition strength) comes from running classical computer-vision algorithms on your image's pixels. The 'How we measured this' panel on each result shows the exact method and thresholds. Nothing is invented.",
  },
  {
    q: "What does 'AI-assisted' critique mean?",
    a: "The mentor notes and critique text interpret the measured numbers. By default these come from grounded templates; if an AI provider is configured, they're written by a vision model that's shown the real measurements as immutable facts. Either way, the model can never override a measured grade — it only describes them.",
  },
  {
    q: "Why is integrity part of the brand?",
    a: "Because discerning artists can tell the difference. A tool that invents a '74% brushwork score' with nothing behind it is useless the moment you probe it. We'd rather give you a real, reproducible measurement and honest interpretation than polished theatre.",
  },
  {
    q: "Can I cancel or get a refund?",
    a: "Yes — cancel anytime from your account. Unused months aren't refunded but you keep access until the period ends.",
  },
  {
    q: "What payment methods?",
    a: "South African customers: PayFast (card, Instant EFT, bank account — settles in ZAR). International customers: USD card via Stripe (coming soon).",
  },
];

export default function PricingPage() {
  return (
    <div className="page active" id="page-pricing">
      <div className="pricing-hero" style={{ paddingTop: "9rem", paddingBottom: "3rem", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "clamp(2.2rem,4.5vw,3.4rem)", color: "var(--cream)", marginBottom: ".8rem" }}>
          Simple, honest pricing
        </h1>
        <p style={{ fontFamily: "var(--sans)", color: "var(--linen-dim)", maxWidth: "560px", margin: "0 auto" }}>
          Every tier uses the same measured pipeline. Pay for depth, not for trust.
        </p>
      </div>

      <div className="plans-grid" style={{
        maxWidth: "1100px", margin: "0 auto", padding: "0 2rem 4rem",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem",
      }}>
        {PLANS.map((p) => (
          <div
            key={p.tier}
            className={`plan-card ${p.featured ? "featured" : ""}`}
            style={{
              background: "var(--charcoal)", border: p.featured ? "1px solid var(--gold)" : "1px solid rgba(200,168,74,.14)",
              padding: "2rem 1.6rem", borderRadius: "var(--r-lg)", position: "relative",
            }}
          >
            {p.featured && (
              <div style={{
                position: "absolute", top: "-.7rem", left: "50%", transform: "translateX(-50%)",
                background: "var(--gold)", color: "var(--ink)", fontFamily: "var(--sans)",
                fontSize: ".55rem", letterSpacing: ".16em", textTransform: "uppercase",
                padding: ".3rem .8rem", borderRadius: "3px",
              }}>
                Most popular
              </div>
            )}
            <div style={{ fontFamily: "var(--serif)", fontSize: "1.5rem", color: "var(--cream)" }}>{p.name}</div>
            <div style={{ fontSize: ".7rem", color: "var(--linen-ghost)", marginBottom: "1.2rem", fontFamily: "var(--sans)" }}>{p.tagline}</div>
            <div style={{ marginBottom: "1.5rem" }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: "2.6rem", color: "var(--gold)" }}>${p.priceUsd}</span>
              <span style={{ fontSize: ".72rem", color: "var(--linen-ghost)", fontFamily: "var(--sans)" }}>/month</span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.8rem 0", fontFamily: "var(--sans)", fontSize: ".8rem", color: "var(--linen-dim)", lineHeight: "2" }}>
              {p.features.map((f, i) => (
                <li key={i} style={{ display: "flex", gap: ".5rem" }}>
                  <span style={{ color: "var(--gold)" }}>✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={p.href}
              className={p.featured ? "btn-gold" : "btn-outline"}
              style={{ display: "block", textAlign: "center" }}
            >
              {p.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="faq-section" style={{ maxWidth: "760px", margin: "0 auto", padding: "0 2rem 6rem" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "1.8rem", color: "var(--cream)", marginBottom: "1.5rem", textAlign: "center" }}>
          Frequently asked
        </h2>
        {FAQ.map((item, i) => (
          <details key={i} style={{ borderBottom: "1px solid rgba(200,168,74,.1)", padding: "1rem 0" }}>
            <summary style={{ fontFamily: "var(--sans)", fontSize: ".9rem", color: "var(--linen)", cursor: "pointer", fontWeight: 500 }}>
              {item.q}
            </summary>
            <p style={{ fontFamily: "var(--sans)", fontSize: ".82rem", color: "var(--linen-dim)", lineHeight: 1.7, marginTop: ".8rem" }}>
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}

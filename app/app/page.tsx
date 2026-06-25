import Link from "next/link";

export default function Home() {
  return (
    <div className="page active" id="page-landing">
      <section className="landing-hero" style={{ paddingTop: "12rem", paddingBottom: "6rem", textAlign: "center" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto", padding: "0 2rem" }}>
          <div style={{ fontFamily: "var(--sans)", fontSize: ".65rem", letterSpacing: ".22em", textTransform: "uppercase", color: "var(--gold)", marginBottom: "1.5rem" }}>
            Atelier-grade portrait analysis
          </div>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(2.4rem,5vw,4rem)", fontWeight: 300, lineHeight: 1.05, color: "var(--cream)", marginBottom: "1.5rem" }}>
            Real measurement.<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>Honest</span> critique.
          </h1>
          <p style={{ fontFamily: "var(--sans)", fontSize: "1.05rem", lineHeight: 1.7, color: "var(--linen-dim)", maxWidth: "620px", margin: "0 auto 2.5rem" }}>
            Upload a portrait and Lummina measures its value structure, composition,
            palette, and edges from the actual pixels — then interprets those
            measurements the way an atelier mentor would. No invented grades.
            Every number is reproducible.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/auth?mode=signup" className="btn-gold">Begin free →</Link>
            <Link href="/sample" className="btn-outline">See a sample analysis</Link>
          </div>
          <p style={{ fontFamily: "var(--sans)", fontSize: ".7rem", color: "var(--linen-ghost)", marginTop: "2rem", fontStyle: "italic" }}>
            Integrity is the brand. Every grade traces back to your image&apos;s pixels.
          </p>
        </div>
      </section>
    </div>
  );
}

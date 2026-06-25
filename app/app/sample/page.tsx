import Link from "next/link";
import { api } from "@/lib/api";
import AnalysisModules from "@/components/AnalysisModules";
import type { AnalysisResult } from "@/lib/api";

// Server component — fetches the real sample analysis at request time.
// Honest demo: same CV pipeline as authenticated analyses, on a fixed image.
async function getSample(): Promise<AnalysisResult | null> {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${backendUrl}/api/analysis/sample`, {
      next: { revalidate: 3600 }, // cache for an hour
    });
    if (!res.ok) return null;
    return (await res.json()) as AnalysisResult;
  } catch {
    return null;
  }
}

export default async function SamplePage() {
  const sample = await getSample();
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  return (
    <div className="page active" id="page-sample">
      <div className="sample-hero" style={{ paddingTop: "8rem", paddingBottom: "2rem", textAlign: "center" }}>
        <div className="sample-badge" style={{
          display: "inline-block", fontFamily: "var(--sans)", fontSize: ".58rem",
          letterSpacing: ".16em", textTransform: "uppercase", color: "var(--gold)",
          border: "1px solid rgba(200,168,74,.2)", padding: ".35rem .8rem", marginBottom: "1.5rem",
        }}>
          Live sample · measured from this image
        </div>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: "clamp(2rem,4vw,3rem)", color: "var(--cream)", marginBottom: ".8rem" }}>
          A complete analysis, on us.
        </h1>
        <p style={{ fontFamily: "var(--sans)", color: "var(--linen-dim)", maxWidth: "640px", margin: "0 auto", lineHeight: 1.7 }}>
          This is a real analysis — the same pipeline that runs on your uploads,
          applied to a fixed reference portrait. Sign up to analyse your own work.
        </p>
      </div>

      {!sample && (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--linen-ghost)" }}>
          The analysis service isn&apos;t reachable right now. Please try again shortly.
        </div>
      )}

      {sample && (
        <div className="sample-layout" style={{
          maxWidth: "1200px", margin: "0 auto", padding: "0 2rem 4rem",
          display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "2.5rem",
        }}>
          <div className="sample-portrait">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${backendUrl}/samples/portrait.jpg`}
              alt="Sample reference portrait"
              style={{ width: "100%", borderRadius: "var(--r)", display: "block" }}
            />
            <div style={{ marginTop: ".8rem", fontSize: ".62rem", color: "var(--linen-ghost)", fontFamily: "var(--sans)" }}>
              Reference portrait {sample.imageHash && <>· sha {sample.imageHash.slice(0, 16)}…</>}
            </div>
          </div>

          <div className="sample-results">
            <AnalysisModules result={sample} showProvenanceBadge />

            <div style={{
              marginTop: "2rem", padding: "1.2rem 1.4rem",
              background: "var(--charcoal)", border: "1px solid rgba(200,168,74,.14)",
              textAlign: "center",
            }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", color: "var(--cream)", marginBottom: ".4rem" }}>
                Analyse your own portrait
              </div>
              <div style={{ fontSize: ".78rem", color: "var(--linen-dim)", marginBottom: "1rem" }}>
                Free tier includes 3 analyses per month. No card required.
              </div>
              <Link href="/auth?mode=signup&next=/workspace" className="btn-gold">
                Begin free →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import type {
  AnalysisResult, ScoreSet, ValueZone, CompRule, BrushStat, BrushTech,
  StyleMatch, GlazeLayer,
} from "@/lib/api";

/**
 * The shared 6-tab analysis renderer. Replaces the three near-duplicate
 * renderers in the original HTML (lh-, sr-, wsc-) with one typed component.
 *
 * The CSS class names (.ana-*, .mentor-note, .ws-tab, etc.) are taken
 * verbatim from the ported lumina.css so the visual output is identical to
 * the original atelier aesthetic.
 */

const TABS = [
  { id: "critique", label: "Critique" },
  { id: "valuemap", label: "Value Map" },
  { id: "composition", label: "Composition" },
  { id: "brushwork", label: "Brushwork" },
  { id: "style", label: "Style" },
  { id: "glazing", label: "Glazing" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AnalysisModules({
  result,
  showProvenanceBadge = false,
}: {
  result: AnalysisResult;
  showProvenanceBadge?: boolean;
}) {
  const [tab, setTab] = useState<TabId>("critique");
  const a = result.analysis;

  return (
    <div>
      {showProvenanceBadge && <ProvenanceBadge source={result.proseSource} />}

      <div className="ws-tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`ws-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="ws-output-body">
        {tab === "critique" && <CritiquePanel scores={a.crit.scores} blocks={a.crit.blocks} mentor={a.crit.mentor} />}
        {tab === "valuemap" && <ValueMapPanel zones={a.vmap.zones} mentor={a.vmap.mentor} />}
        {tab === "composition" && <CompositionPanel rules={a.comp.rules} mentor={a.comp.mentor} />}
        {tab === "brushwork" && <BrushworkPanel stats={a.brush.stats} techs={a.brush.techs} mentor={a.brush.mentor} />}
        {tab === "style" && <StylePanel matches={a.style.matches} mentor={a.style.mentor} />}
        {tab === "glazing" && <GlazingPanel layers={a.glaze.layers} mentor={a.glaze.mentor} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Honesty badge — surfaces whether the prose came from the LLM or the
// deterministic template. The integrity promise, made visible.
// ---------------------------------------------------------------------------
function ProvenanceBadge({ source }: { source: "llm" | "template" }) {
  return (
    <div
      style={{
        fontFamily: "var(--sans)",
        fontSize: ".58rem",
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color: "var(--linen-ghost)",
        marginBottom: "1rem",
        padding: ".4rem .7rem",
        border: "1px solid rgba(200,168,74,.12)",
        display: "inline-flex",
        gap: ".5rem",
        alignItems: "center",
      }}
      title="Every grade is measured from your image's pixels. Prose is either AI-interpreted or template-generated — both grounded in the same measurements."
    >
      <span style={{ color: "var(--gold)" }}>●</span>
      Grades: measured from pixels · Prose: {source === "llm" ? "AI-interpreted" : "template-grounded"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels — each maps the typed contract to the original CSS classes
// ---------------------------------------------------------------------------

function MentorNote({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mentor-note" style={{ marginTop: ".9rem" }}>
      <div className="mn-label">Mentor observation</div>
      <div className="mn-text">{text}</div>
    </div>
  );
}

function CritiquePanel({ scores, blocks, mentor }: {
  scores: ScoreSet; blocks: { cat: string; text: string }[]; mentor: string;
}) {
  const entries: [string, string][] = [
    ["value", scores.val],
    ["composition", scores.comp],
    ["edges", scores.edge],
    ["lighting", scores.light],
  ];
  return (
    <>
      <div className="ana-scores">
        {entries.map(([k, v]) => (
          <div className="ana-score" key={k}>
            <div className="ana-grade">{v}</div>
            <div className="ana-lbl">{k}</div>
          </div>
        ))}
      </div>
      {blocks.map((b, i) => (
        <div className="ana-block" key={i}>
          <div className="ana-block-cat">{b.cat}</div>
          <div className="ana-block-text">{b.text}</div>
        </div>
      ))}
      <MentorNote text={mentor} />
    </>
  );
}

function ValueMapPanel({ zones, mentor }: { zones: ValueZone[]; mentor: string }) {
  return (
    <>
      {zones.map((z, i) => (
        <div className="ana-zone-row" key={i} style={{ borderLeftColor: z.c }}>
          <div className="ana-zone-dot" style={{ background: z.c }} />
          <div className="ana-zone-name">{z.name}</div>
          <div className="ana-zone-bar">
            <div className="ana-zone-fill" style={{ width: `${z.bar}%`, background: z.c }} />
          </div>
          <div className="ana-zone-pct">{z.val}</div>
        </div>
      ))}
      <MentorNote text={mentor} />
    </>
  );
}

function CompositionPanel({ rules, mentor }: { rules: CompRule[]; mentor: string }) {
  return (
    <>
      {rules.map((r, i) => (
        <div className="ana-comp-rule" key={i}>
          <div className="ana-comp-icon">{r.icon}</div>
          <div>
            <div className="ana-comp-name">{r.name}</div>
            <div className="ana-comp-desc">{r.desc}</div>
            <div className="ana-comp-score">{r.score}</div>
          </div>
        </div>
      ))}
      <MentorNote text={mentor} />
    </>
  );
}

function BrushworkPanel({ stats, techs, mentor }: {
  stats: BrushStat[]; techs: BrushTech[]; mentor: string;
}) {
  return (
    <>
      <div className="ana-brush-grid">
        {stats.map((s, i) => (
          <div className="ana-bstat" key={i}>
            <div className="ana-bstat-lbl">{s.lbl}</div>
            <div className="ana-bstat-val">{s.val}</div>
            <div className="ana-bstat-sub">{s.sub}</div>
          </div>
        ))}
      </div>
      {techs.map((t, i) => (
        <div className="ana-brush-tech" key={i}>
          <div className="ana-bt-name">{t.name}</div>
          <div className="ana-bt-desc">{t.desc}</div>
        </div>
      ))}
      <MentorNote text={mentor} />
    </>
  );
}

function StylePanel({ matches, mentor }: { matches: StyleMatch[]; mentor: string }) {
  return (
    <>
      {matches.map((m, i) => (
        <div className="ana-style-row" key={i}>
          <div className="ana-sr-rank">{m.rank}</div>
          <div style={{ flex: 1 }}>
            <div className="ana-sr-name">{m.name}</div>
            <div className="ana-sr-era">{m.era}</div>
            <div className="ana-sr-tags">
              {m.tags.map((t, j) => (
                <span className="ana-sr-tag" key={j}>{t}</span>
              ))}
            </div>
          </div>
          <div className="ana-sr-pct">{m.pct}</div>
        </div>
      ))}
      <MentorNote text={mentor} />
    </>
  );
}

function GlazingPanel({ layers, mentor }: { layers: GlazeLayer[]; mentor: string }) {
  return (
    <>
      {layers.map((l, i) => {
        const pigs: { hex: string; name: string }[] = [];
        for (let j = 0; j + 1 < l.pigs.length; j += 2) {
          pigs.push({ hex: l.pigs[j], name: l.pigs[j + 1] });
        }
        return (
          <div className="ana-glaze-row" key={i}>
            <div className="ana-gl-step">{l.step}</div>
            <div>
              <div className="ana-gl-name">{l.name}</div>
              <div className="ana-gl-desc">{l.desc}</div>
              <div className="ana-gl-pigs">
                {pigs.map((p, j) => (
                  <div className="ana-gl-pig" key={j}>
                    <div className="ana-gl-swatch" style={{ background: p.hex }} />
                    <span>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <MentorNote text={mentor} />
    </>
  );
}

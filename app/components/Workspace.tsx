"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, AnalysisResult, UploadResponse } from "@/lib/api";
import AnalysisModules from "./AnalysisModules";

type Phase = "empty" | "uploaded" | "analysing" | "complete" | "error";

export default function Workspace() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [phase, setPhase] = useState<Phase>("empty");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const fileInput = useRef<HTMLInputElement>(null);
  const dropZone = useRef<HTMLDivElement>(null);

  // Guard: workspace requires auth. Use an effect (not a render-time redirect)
  // so we don't bounce during the brief state-propagation window after a
  // signup/login navigation, when the new page mounts before the auth state
  // has propagated to this component's useAuth() subscription.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth?next=/workspace");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div style={{ paddingTop: "10rem", textAlign: "center", color: "var(--linen-ghost)" }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    // The effect above is handling the redirect; render nothing in the
    // meantime to avoid flashing the upload UI to an unauthenticated user.
    return null;
  }

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setPhase("analysing");
    setProgress("Uploading image…");

    try {
      // 1. Preview locally (instant feedback).
      const previewUrl = URL.createObjectURL(file);
      setImageUrl(previewUrl);

      // 2. Upload to storage.
      const formData = new FormData();
      formData.append("image", file);
      const uploadRes = await api.upload<UploadResponse>("/api/portfolio/upload", formData);
      setUpload(uploadRes);
      setPhase("uploaded");

      // 3. Run the real analysis. Progressive messages — value map first.
      setProgress("Measuring value structure…");
      // Small delay so the user sees the progression (feels like a tool).
      await new Promise((r) => setTimeout(r, 250));
      setProgress("Analysing composition & edges…");
      await new Promise((r) => setTimeout(r, 250));
      setProgress("Building palette & glaze plan…");

      const analysis = await api.post<AnalysisResult>("/api/analysis", {
        uploadId: uploadRes.uploadId,
        skillTier: "beginner",
      });
      setResult(analysis);
      setPhase("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
      setPhase("error");
    }
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dropZone.current?.classList.remove("drag-over");
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    dropZone.current?.classList.add("drag-over");
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dropZone.current?.classList.remove("drag-over");
  }

  return (
    <div className="page active" id="page-workspace">
      <div className="ws-topbar">
        <div>
          <span id="wsLevelLabel2">Portrait analysis</span>
        </div>
        <div id="wrStatus" className="ws-status-chip">
          {phase === "empty" && "Awaiting image"}
          {phase === "uploaded" && "Ready"}
          {phase === "analysing" && "Analysing…"}
          {phase === "complete" && "Complete"}
          {phase === "error" && "Failed"}
        </div>
      </div>

      <div className="ws-stage">
        {/* LEFT — input / preview pane */}
        <div className="ws-input-pane" id="wsInputPane">
          <div className="ws-pane-label">
            Your reference
            <span className="ws-pane-badge">Input</span>
          </div>

          {!imageUrl && (
            <div
              ref={dropZone}
              className="ws-drop-state"
              id="wsDropState"
              onClick={() => fileInput.current?.click()}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              style={{ cursor: "pointer" }}
            >
              <div className="ws-drop-icon">⬆</div>
              <div className="ws-drop-text">
                Drop a portrait here, or <span className="ws-drop-link">browse</span>
              </div>
              <div className="ws-drop-formats">JPEG · PNG · WebP · max 8 MB</div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                style={{ display: "none" }}
              />
            </div>
          )}

          {imageUrl && (
            <div id="wsInputFilled" style={{ display: "block" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                id="wsUploadedImg"
                src={imageUrl}
                alt="Your uploaded reference"
                style={{ width: "100%", display: "block", borderRadius: "var(--r)" }}
              />
              {upload && (
                <div style={{ marginTop: ".6rem", fontSize: ".6rem", color: "var(--linen-ghost)" }}>
                  {upload.width}×{upload.height}px · sha {upload.sha256.slice(0, 12)}…
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — output pane */}
        <div className="ws-output-pane">
          <div className="ws-pane-label">
            Analysis
            <span className="ws-pane-badge" id="wrSubLabel">{phase === "complete" ? "Measured" : "—"}</span>
          </div>
          <div className="ws-output-body">
            {phase === "empty" && (
              <div className="wse-empty">
                <div className="wse-icon">◇</div>
                <div className="wse-title">Upload a portrait to begin</div>
                <div className="wse-sub">
                  Every grade Lummina reports is computed from your image&apos;s
                  pixels — value, composition, edges, palette. Nothing is invented.
                </div>
              </div>
            )}

            {phase === "analysing" && (
              <div className="wse-empty">
                <div className="wse-icon analysing">◐</div>
                <div className="wse-title">{progress}</div>
                <div className="wse-sub">
                  Measuring luminance, edges, and composition deterministically.
                </div>
              </div>
            )}

            {phase === "error" && (
              <div className="wse-empty">
                <div className="wse-icon" style={{ color: "var(--rust-text)" }}>⚠</div>
                <div className="wse-title">Analysis failed</div>
                <div className="wse-sub">{error}</div>
              </div>
            )}

            {phase === "complete" && result && (
              <div id="wsc-critique" style={{ display: "block" }}>
                <AnalysisModules result={result} showProvenanceBadge />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

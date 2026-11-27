"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, FileImage, LoaderCircle, UploadCloud } from "lucide-react";

type RegistrationResult = { status: "detected" | "review_required"; detected_count: number; expected_count: number; minimum_confidence: number | null; next_step: "perspective_correction" | "manual_alignment"; marks: Record<string, { confidence: number }> };

type IntakeResult = {
  status: "accepted" | "review_required";
  stage: "intake_validated";
  sha256: string;
  image: { format: string; width: number; height: number };
  quality: { portrait: boolean; contrast: boolean; status: string };
};

export function ScanUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [correctedUrl, setCorrectedUrl] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [registration, setRegistration] = useState<RegistrationResult | null>(null);
  const [savedScanId, setSavedScanId] = useState<string | null>(null);


  async function handleDetectMarks() {
    if (!file || detecting) return;
    setDetecting(true);
    setError("");
    setRegistration(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/scans/registration-marks", { method: "POST", body: formData });
      const payload = await response.json() as { result?: RegistrationResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Unable to inspect registration marks.");
      setRegistration(payload.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to inspect registration marks.");
    } finally {
      setDetecting(false);
    }
  }

  async function handleCorrect() {
    if (!file || correcting) return;
    setCorrecting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/scans/correct", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "The sheet needs manual alignment.");
      }
      const imageBlob = await response.blob();
      const nextUrl = URL.createObjectURL(imageBlob);
      setCorrectedUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to correct this image.");
    } finally {
      setCorrecting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;

    setBusy(true);
    setError("");
    setResult(null);
    setSavedScanId(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/scans/intake", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json() as { result?: IntakeResult; scan?: { id: string }; error?: string };
      if (!response.ok || !payload.result || !payload.scan) {
        throw new Error(payload.error || "The image could not be checked.");
      }
      setResult(payload.result);
      setSavedScanId(payload.scan.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to process this image.");
    } finally {
      setBusy(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setError("");
    setResult(null);
    setSavedScanId(null);
    setRegistration(null);
    setCorrectedUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return null; });
  }

  return (
    <section className="scan-page">
      <header className="management-intro">
        <p className="eyebrow">OMR PROCESSING</p>
        <h1>Scan answer sheets</h1>
        <p>Upload a clear photo or scan of a printed answer sheet. The intake check validates the image and flags quality issues before calibration.</p>
      </header>

      <div className="management-panel scan-upload-panel">
        <div className="management-panel-heading">
          <div>
            <h2>New image intake</h2>
            <p>JPEG, PNG, or WebP · Maximum 10 MB · Portrait images recommended</p>
          </div>
          <span className="scan-secure-label"><CheckCircle2 size={14} /> Private service</span>
        </div>

        <form className="scan-upload-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="scan-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            aria-label="Choose an OMR answer sheet image"
          />
          <button
            className="scan-dropzone"
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-describedby="scan-upload-help"
          >
            <span className="scan-dropzone-icon"><UploadCloud size={23} /></span>
            <strong>{file ? file.name : "Choose an answer sheet image"}</strong>
            <span>{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB · ${file.type || "Unknown type"}` : "Select a file from your device"}</span>
          </button>
          <p id="scan-upload-help" className="scan-upload-help">The image is sent to the private OMR intake service for validation. It is not saved as a scan record yet.</p>
          {error ? <p className="form-alert error" role="alert"><AlertCircle size={16} /> {error}</p> : null}
          <button className="button button-primary" type="submit" disabled={!file || busy}>
            {busy ? <><LoaderCircle className="spin" size={16} /> Checking image…</> : <><FileImage size={16} /> Validate image</>}
          </button>
        </form>
      </div>

      {result ? (
        <section className="management-panel scan-result-panel" aria-live="polite">
          <div className="management-panel-heading">
            <div>
              <h2>Image intake result</h2>
              <p>{result.status === "accepted" ? "Image passed the initial quality checks." : "Image needs a manual quality review."}</p>
            </div>
            <span className={`scan-status-pill ${result.status === "accepted" ? "is-accepted" : "is-review"}`}>
              {result.status === "accepted" ? "Accepted" : "Review required"}
            </span>
          </div>
          <dl className="scan-result-grid">
            <div><dt>Image size</dt><dd>{result.image.width} × {result.image.height}px</dd></div>
            <div><dt>Format</dt><dd>{result.image.format}</dd></div>
            <div><dt>Portrait orientation</dt><dd>{result.quality.portrait ? "Passed" : "Check image"}</dd></div>
            <div><dt>Image contrast</dt><dd>{result.quality.contrast ? "Passed" : "Needs review"}</dd></div>
          </dl>
          <p className="scan-fingerprint">Image fingerprint: <code>{result.sha256}</code></p>
          {savedScanId ? <p className="scan-disclaimer" role="status">Scan saved privately. Record: <code>{savedScanId}</code></p> : null}
          <p className="scan-disclaimer">Intake and registration-mark alignment are available for review. Bubble recognition, student matching, and grading are not active yet.</p>
          <div className="scan-review-actions">
            <button className="button button-secondary" type="button" onClick={handleDetectMarks} disabled={detecting}>
              {detecting ? <><LoaderCircle className="spin" size={16} /> Checking marks…</> : "Inspect registration marks"}
            </button>
            <button className="button button-primary" type="button" onClick={handleCorrect} disabled={correcting}>
            {correcting ? <><LoaderCircle className="spin" size={16} /> Aligning sheet…</> : "Correct perspective"}
            </button>
          </div>
          {registration ? (
            <div className="scan-registration-review" aria-live="polite">
              <h3>Registration mark review</h3>
              <p>{registration.detected_count} of {registration.expected_count} corner marks detected · {registration.minimum_confidence === null ? "Confidence unavailable" : `Minimum confidence ${Math.round(registration.minimum_confidence * 100)}%`}</p>
              <ul>
                {(["top_left", "top_right", "bottom_left", "bottom_right"] as const).map((corner) => (
                  <li key={corner}>
                    <span>{corner.replace("_", " ")}</span>
                    <strong>{registration.marks[corner] ? `Detected · ${Math.round(registration.marks[corner].confidence * 100)}%` : "Missing — manual review"}</strong>
                  </li>
                ))}
              </ul>
              <p>{registration.status === "detected" ? "All four marks were located. Perspective correction can be attempted." : "Do not continue automatically. Re-capture the full sheet with all four black corner marks visible."}</p>
            </div>
          ) : null}
          {correctedUrl ? <div className="scan-corrected-preview"><h3>Aligned sheet preview</h3><img src={correctedUrl} alt="Perspective-corrected OMR sheet" /><a href={correctedUrl} download="corrected-omr-sheet.jpg">Download corrected image</a></div> : null}
        </section>
      ) : null}
    </section>
  );
}

"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, Camera, CheckCircle2, FileImage, LoaderCircle, UploadCloud } from "lucide-react";

type RegistrationResult = { status: "detected" | "review_required"; detected_count: number; expected_count: number; minimum_confidence: number | null; next_step: "perspective_correction" | "manual_alignment"; marks: Record<string, { confidence: number }> };

type ScanRecord = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  image: { format: string; width: number; height: number };
  quality: { portrait: boolean; contrast: boolean; status: string };
  status: "intake_validated" | "review_required";
  createdAt: string;
  examId?: string | null;
  studentId?: string | null;
  matchedAt?: string | null;
};

type ExamOption = { id: string; title: string; examCode: string; status: string };
type StudentOption = { id: string; name: string; studentCode: string; className: string; rollNumber: string };

type IntakeResult = {
  status: "accepted" | "review_required";
  stage: "intake_validated";
  sha256: string;
  image: { format: string; width: number; height: number };
  quality: { portrait: boolean; contrast: boolean; status: string };
};

export function ScanUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [correctedUrl, setCorrectedUrl] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [registration, setRegistration] = useState<RegistrationResult | null>(null);
  const [savedScanId, setSavedScanId] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [matchingOptions, setMatchingOptions] = useState<{ exams: ExamOption[]; students: StudentOption[] }>({ exams: [], students: [] });
  const [matchingSelection, setMatchingSelection] = useState<Record<string, { examId: string; studentId: string }>>({});
  const [matchingBusy, setMatchingBusy] = useState<string | null>(null);
  const [matchingMessages, setMatchingMessages] = useState<Record<string, string>>({});

  const loadScans = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/scans?limit=25", { cache: "no-store" });
      const payload = await response.json() as { scans?: ScanRecord[]; error?: string };
      if (!response.ok || !payload.scans) throw new Error(payload.error || "Unable to load scan history.");
      setScans(payload.scans);
    } catch (caught) {
      setHistoryError(caught instanceof Error ? caught.message : "Unable to load scan history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadMatchingOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/scans/matching-options", { cache: "no-store" });
      const payload = await response.json() as { exams?: ExamOption[]; students?: StudentOption[] };
      if (response.ok && payload.exams && payload.students) setMatchingOptions({ exams: payload.exams, students: payload.students });
    } catch {
      setMatchingOptions({ exams: [], students: [] });
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => { void loadScans(); void loadMatchingOptions(); });
  }, [loadScans, loadMatchingOptions]);


  async function handleMatchScan(scanId: string) {
    const selection = matchingSelection[scanId];
    const examId = selection?.examId;
    if (!examId || matchingBusy) return;
    setMatchingBusy(scanId);
    setMatchingMessages((previous) => ({ ...previous, [scanId]: "" }));
    try {
      const response = await fetch(`/api/scans/${scanId}/match`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, studentId: selection.studentId || null }),
      });
      const payload = await response.json() as { exam?: { title: string; examCode: string }; error?: string };
      if (!response.ok || !payload.exam) throw new Error(payload.error || "Unable to match this scan.");
      setMatchingMessages((previous) => ({ ...previous, [scanId]: `Matched to ${payload.exam?.title} (${payload.exam?.examCode}).` }));
      await loadScans();
    } catch (caught) {
      setMatchingMessages((previous) => ({ ...previous, [scanId]: caught instanceof Error ? caught.message : "Unable to match this scan." }));
    } finally { setMatchingBusy(null); }
  }

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
      await loadScans();
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
            aria-label="Choose an OMR answer sheet image from your device"
          />
          <input
            ref={cameraRef}
            className="scan-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={handleFileChange}
            aria-label="Take a photo of an OMR answer sheet"
          />
          <button
            className="scan-dropzone"
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-describedby="scan-upload-help"
          >
            <span className="scan-dropzone-icon"><UploadCloud size={23} /></span>
            <strong>{file ? file.name : "Answer sheet image"}</strong>
            <span>{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB · ${file.type || "Unknown type"}` : "Use the camera or choose an image below"}</span>
          </button>
          <div className="scan-capture-actions">
            <button className="button button-secondary" type="button" onClick={() => cameraRef.current?.click()}>
              <Camera size={16} /> Take photo
            </button>
            <button className="button button-secondary" type="button" onClick={() => inputRef.current?.click()}>
              <FileImage size={16} /> Choose from device
            </button>
          </div>
          <p id="scan-upload-help" className="scan-upload-help">On Android, Take photo opens the rear camera when supported. You can also choose an existing image. The image is validated and saved privately to this institution’s scan history.</p>
          {error ? <p className="form-alert error" role="alert"><AlertCircle size={16} /> {error}</p> : null}
          <button className="button button-primary" type="submit" disabled={!file || busy}>
            {busy ? <><LoaderCircle className="spin" size={16} /> Checking image…</> : <><FileImage size={16} /> Validate image</>}
          </button>
        </form>
      </div>

      <section className="management-panel scan-history-panel" aria-labelledby="scan-history-title">
        <div className="management-panel-heading">
          <div>
            <h2 id="scan-history-title">Recent scans</h2>
            <p>Private image records belonging to your active institution.</p>
          </div>
          <button className="button button-secondary scan-history-refresh" type="button" onClick={() => void loadScans()} disabled={historyLoading}>
            {historyLoading ? <><LoaderCircle className="spin" size={15} /> Loading…</> : "Refresh"}
          </button>
        </div>
        {historyError ? <p className="form-alert error" role="alert">{historyError}</p> : null}
        {historyLoading && scans.length === 0 ? <p className="scan-history-message" role="status">Loading scan history…</p> : null}
        {!historyLoading && !historyError && scans.length === 0 ? <p className="scan-history-message">No scans yet. Validated answer-sheet images will appear here.</p> : null}
        {scans.length > 0 ? (
          <ul className="scan-history-list">
            {scans.map((scan) => (
              <li key={scan.id} className="scan-history-item">
                <div className="scan-history-icon"><FileImage size={18} /></div>
                <div className="scan-history-details">
                  <strong title={scan.filename}>{scan.filename}</strong>
                  <span>{scan.image.width} × {scan.image.height}px · {(scan.sizeBytes / (1024 * 1024)).toFixed(2)} MB · {new Date(scan.createdAt).toLocaleString()}</span>
                  <span className={`scan-history-status ${scan.status === "intake_validated" ? "is-validated" : "is-review"}`}>
                    {scan.status === "intake_validated" ? "Intake validated" : "Review required"}
                  </span>
                </div>
                <div className="scan-history-actions">
                  <a className="scan-history-open" href={`/api/scans/${scan.id}/image`} target="_blank" rel="noreferrer" aria-label={`Open private scan image: ${scan.filename}`}>View image</a>
                  <details className="scan-match-details">
                    <summary>{scan.examId ? "Update match" : "Match to exam"}</summary>
                    <div className="scan-match-form">
                      <label>Exam
                        <select value={matchingSelection[scan.id]?.examId ?? scan.examId ?? ""} onChange={(event) => setMatchingSelection((previous) => ({ ...previous, [scan.id]: { examId: event.target.value, studentId: previous[scan.id]?.studentId ?? scan.studentId ?? "" } }))}>
                          <option value="">Choose an exam</option>
                          {matchingOptions.exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title} · {exam.examCode}</option>)}
                        </select>
                      </label>
                      <label>Student (optional)
                        <select value={matchingSelection[scan.id]?.studentId ?? scan.studentId ?? ""} onChange={(event) => setMatchingSelection((previous) => ({ ...previous, [scan.id]: { examId: previous[scan.id]?.examId ?? scan.examId ?? "", studentId: event.target.value } }))}>
                          <option value="">Not assigned yet</option>
                          {matchingOptions.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.studentCode}{student.rollNumber ? ` · Roll ${student.rollNumber}` : ""}</option>)}
                        </select>
                      </label>
                      <button className="button button-primary" type="button" disabled={!(matchingSelection[scan.id]?.examId ?? scan.examId) || matchingBusy !== null} onClick={() => void handleMatchScan(scan.id)}>
                        {matchingBusy === scan.id ? "Saving…" : "Save match"}
                      </button>
                      {matchingMessages[scan.id] ? <p className="scan-match-message" role="status">{matchingMessages[scan.id]}</p> : null}
                    </div>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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
          <p className="scan-disclaimer">Image intake, registration-mark inspection, perspective correction, and manual exam/student matching are available. Bubble recognition and automated grading are not active yet.</p>
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
          {correctedUrl ? <div className="scan-corrected-preview"><h3>Aligned sheet preview</h3><Image src={correctedUrl} alt="Perspective-corrected OMR sheet" width={1240} height={1754} unoptimized /><a href={correctedUrl} download="corrected-omr-sheet.jpg">Download corrected image</a></div> : null}
        </section>
      ) : null}
    </section>
  );
}

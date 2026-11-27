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
  latestRecognition?: { id: string; pageNumber: number; engineStatus: string; summary: Record<string, number>; status: string; answers: RecognizedQuestion[]; reviewAnswers: Array<{ questionNumber: number; answer: ReviewAnswerValue }> } | null;
};

type ExamOption = { id: string; title: string; examCode: string; status: string; questionsPerPage: number; subjects: Array<{ id: string; name: string; questionCount: number; calibratedPages: number[] }> };
type StudentOption = { id: string; name: string; studentCode: string; className: string; rollNumber: string };

type BubbleOptionScore = { option: string; fill_ratio: number; confidence: number };
type RecognizedQuestion = { question_number: number; answer: string | null; status: string; confidence: number; options: BubbleOptionScore[] };
type BubbleRecognition = { status: string; question_count: number; summary: Record<string, number>; questions: RecognizedQuestion[] };
type ReviewAnswerValue = "A" | "B" | "C" | "D" | "BLANK" | "MULTIPLE" | "UNREADABLE";
type RecognitionDraft = { recognitionId: string; pageNumber: number; result: BubbleRecognition; answers: Array<{ questionNumber: number; answer: ReviewAnswerValue }>; reviewed: boolean };

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
  const [recognitionSelection, setRecognitionSelection] = useState<Record<string, { subjectId: string; pageNumber: number }>>({});
  const [recognitionBusy, setRecognitionBusy] = useState<string | null>(null);
  const [recognitionMessages, setRecognitionMessages] = useState<Record<string, string>>({});
  const [recognitionResults, setRecognitionResults] = useState<Record<string, RecognitionDraft>>({});
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);

  const loadScans = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/scans?limit=25", { cache: "no-store" });
      const payload = await response.json() as { scans?: ScanRecord[]; error?: string };
      if (!response.ok || !payload.scans) throw new Error(payload.error || "Unable to load scan history.");
      setScans(payload.scans);
      setRecognitionResults(Object.fromEntries(payload.scans.flatMap((scan) => scan.latestRecognition ? [[scan.id, {
        recognitionId: scan.latestRecognition.id,
        pageNumber: scan.latestRecognition.pageNumber,
        result: { status: scan.latestRecognition.engineStatus, question_count: scan.latestRecognition.answers.length, summary: scan.latestRecognition.summary, questions: scan.latestRecognition.answers },
        answers: scan.latestRecognition.reviewAnswers,
        reviewed: scan.latestRecognition.status === "reviewed",
      }]] : [])));
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


  async function handleMatchScan(scanId: string, existingExamId?: string | null, existingStudentId?: string | null) {
    const selection = matchingSelection[scanId];
    const examId = selection?.examId ?? existingExamId ?? "";
    const studentId = selection?.studentId ?? existingStudentId ?? "";
    if (!examId || matchingBusy) return;
    setMatchingBusy(scanId);
    setMatchingMessages((previous) => ({ ...previous, [scanId]: "" }));
    try {
      const response = await fetch(`/api/scans/${scanId}/match`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, studentId: studentId || null }),
      });
      const payload = await response.json() as { exam?: { title: string; examCode: string }; error?: string };
      if (!response.ok || !payload.exam) throw new Error(payload.error || "Unable to match this scan.");
      setMatchingMessages((previous) => ({ ...previous, [scanId]: `Matched to ${payload.exam?.title} (${payload.exam?.examCode}).` }));
      await loadScans();
    } catch (caught) {
      setMatchingMessages((previous) => ({ ...previous, [scanId]: caught instanceof Error ? caught.message : "Unable to match this scan." }));
    } finally { setMatchingBusy(null); }
  }


  async function handleRecognize(scanId: string, subjectId: string, pageNumber: number) {
    if (!subjectId || recognitionBusy) return;
    setRecognitionBusy(scanId);
    setRecognitionMessages((previous) => ({ ...previous, [scanId]: "" }));
    try {
      const response = await fetch(`/api/scans/${scanId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, pageNumber }),
      });
      const payload = await response.json() as { recognitionId?: string; result?: BubbleRecognition; error?: string };
      if (!response.ok || !payload.result || !payload.recognitionId) throw new Error(payload.error || "Unable to recognize this sheet page.");
      setRecognitionResults((previous) => ({ ...previous, [scanId]: { recognitionId: payload.recognitionId!, pageNumber, result: payload.result!, reviewed: false, answers: payload.result!.questions.map((question) => ({ questionNumber: question.question_number, answer: question.answer ?? (question.status === "blank" ? "BLANK" : question.status === "multiple" ? "MULTIPLE" : "UNREADABLE") as ReviewAnswerValue })) } }));
      setRecognitionMessages((previous) => ({ ...previous, [scanId]: "Draft saved. Review every answer, then submit the examiner review." }));
    } catch (caught) {
      setRecognitionMessages((previous) => ({ ...previous, [scanId]: caught instanceof Error ? caught.message : "Unable to recognize this sheet page." }));
    } finally {
      setRecognitionBusy(null);
    }
  }

  async function handleSaveReview(scanId: string) {
    const draft = recognitionResults[scanId];
    if (!draft || draft.reviewed || reviewBusy) return;
    setReviewBusy(scanId);
    setRecognitionMessages((previous) => ({ ...previous, [scanId]: "" }));
    try {
      const response = await fetch(`/api/recognitions/${draft.recognitionId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: draft.answers }),
      });
      const payload = await response.json() as { recognition?: { status: string }; error?: string };
      if (!response.ok || payload.recognition?.status !== "reviewed") throw new Error(payload.error || "Unable to save the examiner review.");
      setRecognitionResults((previous) => ({ ...previous, [scanId]: { ...previous[scanId], reviewed: true } }));
      setRecognitionMessages((previous) => ({ ...previous, [scanId]: "Examiner review saved and locked. Answer edits are recorded in the audit history." }));
    } catch (caught) {
      setRecognitionMessages((previous) => ({ ...previous, [scanId]: caught instanceof Error ? caught.message : "Unable to save the examiner review." }));
    } finally {
      setReviewBusy(null);
    }
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
            {scans.map((scan) => {
              const linkedExam = matchingOptions.exams.find((exam) => exam.id === scan.examId);
              const recognitionChoice = recognitionSelection[scan.id];
              const selectedSubject = linkedExam?.subjects.find((subject) => subject.id === (recognitionChoice?.subjectId ?? linkedExam.subjects[0]?.id));
              const selectedPage = recognitionChoice?.pageNumber ?? 0;
              const recognitionPageCount = selectedSubject ? Math.ceil(selectedSubject.questionCount / (linkedExam?.questionsPerPage ?? 40)) : 0;
              const pageCalibrated = selectedSubject?.calibratedPages.includes(selectedPage) ?? false;
              return (
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
                      <button className="button button-primary" type="button" disabled={!(matchingSelection[scan.id]?.examId ?? scan.examId) || matchingBusy !== null} onClick={() => void handleMatchScan(scan.id, scan.examId, scan.studentId)}>
                        {matchingBusy === scan.id ? "Saving…" : "Save match"}
                      </button>
                      {matchingMessages[scan.id] ? <p className="scan-match-message" role="status">{matchingMessages[scan.id]}</p> : null}
                    </div>
                  </details>
                  {scan.examId ? (
                    <div className="scan-recognition-panel">
                      <strong>Bubble recognition</strong>
                      {linkedExam && selectedSubject ? (
                        <>
                          <label>Subject
                            <select value={selectedSubject.id} onChange={(event) => setRecognitionSelection((previous) => ({ ...previous, [scan.id]: { subjectId: event.target.value, pageNumber: 0 } }))}>
                              {linkedExam.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} · {subject.questionCount} questions</option>)}
                            </select>
                          </label>
                          <label>Sheet page
                            <select value={selectedPage} onChange={(event) => setRecognitionSelection((previous) => ({ ...previous, [scan.id]: { subjectId: selectedSubject.id, pageNumber: Number(event.target.value) } }))}>
                              {Array.from({ length: recognitionPageCount }, (_, page) => <option key={page} value={page}>Page {page + 1}{selectedSubject.calibratedPages.includes(page) ? " · calibrated" : " · not calibrated"}</option>)}
                            </select>
                          </label>
                          <button className="button button-primary" type="button" disabled={!pageCalibrated || recognitionBusy !== null} onClick={() => void handleRecognize(scan.id, selectedSubject.id, selectedPage)}>
                            {recognitionBusy === scan.id ? "Reading bubbles…" : "Recognize answers"}
                          </button>
                          {!pageCalibrated ? <p className="helper-copy">Open this exam’s OMR sheet designer and calibrate the selected subject before recognition.</p> : null}
                        </>
                      ) : <p className="helper-copy">Load exam options to continue.</p>}
                      {recognitionMessages[scan.id] ? <p className="scan-match-message" role="status">{recognitionMessages[scan.id]}</p> : null}
                      {recognitionResults[scan.id] ? (
                        <div className="scan-recognition-result" aria-live="polite">
                          <p>Page {recognitionResults[scan.id].pageNumber + 1} · {recognitionResults[scan.id].result.question_count} questions · {recognitionResults[scan.id].reviewed ? "reviewed and locked" : "pending examiner review"}</p>
                          <div className="scan-recognition-summary">
                            {Object.entries(recognitionResults[scan.id].result.summary).map(([status, count]) => <span key={status}>{status}: <strong>{count}</strong></span>)}
                          </div>
                          <div className="scan-manual-review">
                            <div className="scan-review-source">
                              <strong>Original answer sheet</strong>
                              <Image src={`/api/scans/${scan.id}/image`} alt={`Original answer sheet: ${scan.filename}`} width={420} height={594} unoptimized />
                              <a href={`/api/scans/${scan.id}/image`} target="_blank" rel="noreferrer">Open full-size scan</a>
                            </div>
                            <div className="scan-review-answers">
                              <strong>Confirm or correct each answer</strong>
                              <ol>
                                {recognitionResults[scan.id].result.questions.map((question) => {
                                  const current = recognitionResults[scan.id].answers.find((answer) => answer.questionNumber === question.question_number);
                                  const uncertain = question.status !== "recognized" || question.confidence < 0.75;
                                  return (
                                    <li key={question.question_number} className={uncertain ? "needs-review" : ""}>
                                      <label htmlFor={`answer-${scan.id}-${question.question_number}`}>Q{question.question_number}</label>
                                      <select
                                        id={`answer-${scan.id}-${question.question_number}`}
                                        value={current?.answer ?? "UNREADABLE"}
                                        disabled={recognitionResults[scan.id].reviewed || reviewBusy === scan.id}
                                        onChange={(event) => {
                                          const answer = event.target.value as ReviewAnswerValue;
                                          setRecognitionResults((previous) => ({
                                            ...previous,
                                            [scan.id]: {
                                              ...previous[scan.id],
                                              answers: previous[scan.id].answers.map((item) => item.questionNumber === question.question_number ? { ...item, answer } : item),
                                            },
                                          }));
                                        }}
                                      >
                                        <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                                        <option value="BLANK">Blank</option><option value="MULTIPLE">Multiple marks</option><option value="UNREADABLE">Unreadable</option>
                                      </select>
                                      <small>{Math.round(question.confidence * 100)}% · {question.status.replace("_", " ")}</small>
                                    </li>
                                  );
                                })}
                              </ol>
                              <button className="button button-primary" type="button" disabled={recognitionResults[scan.id].reviewed || reviewBusy !== null} onClick={() => void handleSaveReview(scan.id)}>
                                {recognitionResults[scan.id].reviewed ? "Review locked" : reviewBusy === scan.id ? "Saving review…" : "Save examiner review"}
                              </button>
                            </div>
                          </div>
                          <p className="helper-copy">Low-confidence and ambiguous detections are highlighted. Compare every answer with the original image. Saving locks this review and records changed answers; grading remains disabled.</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
              );
            })}
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
          <p className="scan-disclaimer">Image intake, registration-mark inspection, perspective correction, and manual exam/student matching are available. Experimental bubble recognition requires a saved subject calibration and manual answer review; grading is not active.</p>
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

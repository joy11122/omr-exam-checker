import Link from "next/link";
import mongoose from "mongoose";
import { ArrowLeft, CheckCircle2, FileText, Printer, Settings2 } from "lucide-react";
import { auth } from "@/auth";
import { updateOmrTemplate } from "@/app/actions/omr-sheets";
import { PrintButton } from "@/components/omr/print-button";
import { SaveBubbleCalibration } from "@/components/omr/save-bubble-calibration";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Exam, Student } from "@/models";

type SubjectRecord = { _id: mongoose.Types.ObjectId; name: string; questionCount: number };
type ExamRecord = {
  _id: mongoose.Types.ObjectId;
  title: string;
  examCode: string;
  durationMinutes: number;
  subjects: SubjectRecord[];
  sheetSettings?: { rollDigits?: number; questionsPerPage?: number; includeStudentName?: boolean; includeClass?: boolean; instructions?: string };
};
type StudentRecord = { _id: mongoose.Types.ObjectId; studentCode: string; fullName: string; className?: string; section?: string; rollNumber?: string };
type Props = { params: Promise<{ examId: string }>; searchParams: Promise<{ institutionId?: string; subjectId?: string; studentId?: string; saved?: string; error?: string }> };

function Bubble({ label, question }: { label: string; question: number }) {
  return <span className="omr-bubble" data-question={question} data-option={label} aria-label={`Question ${question}, option ${label}`}>{label}</span>;
}

function OmrPage({ exam, subject, student, settings, pageNumber, pageCount }: {
  exam: ExamRecord; subject: SubjectRecord; student: StudentRecord | null;
  settings: Required<NonNullable<ExamRecord["sheetSettings"]>>; pageNumber: number; pageCount: number;
}) {
  const firstQuestion = pageNumber * settings.questionsPerPage + 1;
  const lastQuestion = Math.min(subject.questionCount, firstQuestion + settings.questionsPerPage - 1);
  const questions = Array.from({ length: lastQuestion - firstQuestion + 1 }, (_, index) => firstQuestion + index);
  const sheetCode = [exam.examCode, String(subject._id).slice(-6), student?.studentCode ?? "BLANK"].join("-");
  return <article className="omr-paper" data-omr-paper="">
    <div className="omr-registration top-left" /><div className="omr-registration top-right" />
    <div className="omr-registration bottom-left" /><div className="omr-registration bottom-right" />
    <header className="omr-paper-header">
      <div><p className="omr-kicker">OFFICIAL ANSWER SHEET</p><h1>{exam.title}</h1><h2>{subject.name}</h2></div>
      <div className="omr-paper-meta"><strong>{exam.examCode}</strong><span>Page {pageNumber + 1} of {pageCount}</span><span>{exam.durationMinutes} minutes</span></div>
    </header>
    <div className="omr-sheet-code"><span>SHEET IDENTIFIER</span><strong>{sheetCode}</strong></div>
    <section className="omr-candidate">
      {settings.includeStudentName ? <div className="omr-candidate-field"><span>STUDENT NAME</span><strong>{student?.fullName ?? "Write your full name clearly"}</strong></div> : null}
      <div className="omr-candidate-field"><span>STUDENT ID</span><strong>{student?.studentCode ?? "Write your student ID"}</strong></div>
      {settings.includeClass ? <div className="omr-candidate-field"><span>CLASS / SECTION</span><strong>{[student?.className, student?.section].filter(Boolean).join(" / ") || "________________"}</strong></div> : null}
    </section>
    <section className="omr-roll-section">
      <div className="omr-section-title"><strong>ROLL NUMBER</strong><span>Fill one bubble in each column</span></div>
      <div className="omr-roll-grid">
        <div className="omr-digit-labels"><span>POSITION</span>{Array.from({ length: settings.rollDigits }, (_, i) => <b key={i}>{i + 1}</b>)}</div>
        {Array.from({ length: 10 }, (_, digit) => <div className="omr-digit-column" key={digit}><strong>{digit}</strong>{Array.from({ length: settings.rollDigits }, (_, position) => <span className="omr-bubble" key={position} />)}</div>)}
      </div>
    </section>
    <section className="omr-answers">
      <div className="omr-section-title"><strong>ANSWER GRID</strong><span>Fill exactly one bubble for each question</span></div>
      <div className="omr-question-grid">
        {questions.map((question) => <div className="omr-question-row" key={question}><b>{String(question).padStart(3, "0")}</b>{["A", "B", "C", "D"].map((option) => <Bubble key={option} label={option} question={question} />)}</div>)}
      </div>
    </section>
    <footer className="omr-paper-footer"><span>{settings.instructions || "Use a dark blue or black ballpoint pen. Fill bubbles completely. Do not fold or mark this sheet."}</span><strong>{sheetCode}</strong></footer>
  </article>;
}

export default async function OmrSheetsPage({ params, searchParams }: Props) {
  const [{ examId }, query] = await Promise.all([params, searchParams]);
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id) || !mongoose.isValidObjectId(examId)) return null;
  const current = await getCurrentInstitution(session.user.id, query.institutionId);
  if (!current) return <section className="management-page"><h1>Exam unavailable</h1><Link href="/dashboard">Return to dashboard</Link></section>;
  await connectToDatabase();
  const exam = await Exam.findOne({ _id: new mongoose.Types.ObjectId(examId), institutionId: new mongoose.Types.ObjectId(current.institutionId) }).lean().exec() as unknown as ExamRecord | null;
  if (!exam) return <section className="management-page"><h1>Exam not found</h1><Link href={"/exams?institutionId=" + current.institutionId}>Back to exams</Link></section>;
  const students = await Student.find({ institutionId: new mongoose.Types.ObjectId(current.institutionId), status: "active" }).sort({ fullName: 1 }).limit(200).select("studentCode fullName className section rollNumber").lean().exec() as unknown as StudentRecord[];
  const subject = exam.subjects.find((item) => String(item._id) === query.subjectId) ?? exam.subjects[0];
  const student = query.studentId && mongoose.isValidObjectId(query.studentId) ? students.find((item) => String(item._id) === query.studentId) ?? null : null;
  const settings = {
    rollDigits: exam.sheetSettings?.rollDigits ?? 6,
    questionsPerPage: exam.sheetSettings?.questionsPerPage ?? 40,
    includeStudentName: exam.sheetSettings?.includeStudentName ?? true,
    includeClass: exam.sheetSettings?.includeClass ?? true,
    instructions: exam.sheetSettings?.instructions ?? "Use a dark blue or black ballpoint pen. Fill bubbles completely. Do not fold or mark this sheet.",
  };
  const canEdit = ["owner", "admin", "teacher"].includes(String(current.role));
  const pageCount = subject ? Math.ceil(subject.questionCount / settings.questionsPerPage) : 0;
  return <div className="management-page omr-builder">
    <div className="page-topline no-print"><span className="eyebrow">PRINT PRODUCTION</span><span className="secure-chip"><FileText size={14}/> A4 OMR template</span></div>
    <Link className="back-link no-print" href={"/exams/" + examId + "?institutionId=" + current.institutionId}><ArrowLeft size={15}/> Back to exam</Link>
    <section className="management-intro no-print"><p className="muted-copy">{exam.examCode} · {exam.title}</p><h1>OMR sheet designer</h1><p>Configure the answer-sheet layout, select a subject and candidate, then print a scan-ready A4 sheet.</p></section>
    {query.saved ? <div className="form-alert success no-print"><CheckCircle2 size={16}/> Sheet template settings saved.</div> : null}\n    {query.error ? <div className="form-alert error no-print">The template could not be saved. Check your permissions and settings, then try again.</div> : null}
    <div className="omr-builder-grid no-print">
      <section className="management-panel">
        <div className="management-panel-heading"><div><h2>Template settings</h2><p>These settings apply to every subject in this exam.</p></div><Settings2 size={19}/></div>
        <form action={updateOmrTemplate} className="management-form">
          <input type="hidden" name="institutionId" value={current.institutionId}/><input type="hidden" name="examId" value={examId}/>
          <div className="form-two-columns"><label>Roll number digits<input type="number" name="rollDigits" min={4} max={12} defaultValue={settings.rollDigits} disabled={!canEdit}/></label><label>Questions per page<input type="number" name="questionsPerPage" min={20} max={80} step={10} defaultValue={settings.questionsPerPage} disabled={!canEdit}/></label></div>
          <label className="omr-check-label"><input type="checkbox" name="includeStudentName" defaultChecked={settings.includeStudentName} disabled={!canEdit}/> Include student name field</label>
          <label className="omr-check-label"><input type="checkbox" name="includeClass" defaultChecked={settings.includeClass} disabled={!canEdit}/> Include class and section</label>
          <label>Candidate instructions<textarea name="instructions" rows={3} maxLength={300} defaultValue={settings.instructions} disabled={!canEdit}/></label>
          {canEdit ? <button className="button button-primary" type="submit">Save template settings</button> : <p className="helper-copy">You have read-only access to this template.</p>}
        </form>
      </section>
      <section className="management-panel">
        <div className="management-panel-heading"><div><h2>Sheet preview</h2><p>Select the subject and student for this print job.</p></div><Printer size={19}/></div>
        <form method="get" className="management-form">
          <input type="hidden" name="institutionId" value={current.institutionId}/>
          <label>Subject<select name="subjectId" defaultValue={String(subject?._id ?? "")}>{exam.subjects.map((item) => <option key={String(item._id)} value={String(item._id)}>{item.name} · {item.questionCount} questions</option>)}</select></label>
          <label>Student<select name="studentId" defaultValue={student ? String(student._id) : ""}><option value="">Blank / master sheet</option>{students.map((item) => <option key={String(item._id)} value={String(item._id)}>{item.fullName} · {item.studentCode}</option>)}</select></label>
          <button className="button button-secondary" type="submit">Update preview</button>
          <p className="helper-copy">{students.length} active students loaded (maximum 200). Select a candidate to prefill their printed identity.</p>
        </form>
        {subject ? <div className="omr-print-summary"><strong>{subject.name}</strong><span>{subject.questionCount} questions · {pageCount} A4 page{pageCount === 1 ? "" : "s"}</span><SaveBubbleCalibration examId={examId} subjectId={String(subject._id)}/><PrintButton/></div> : null}
      </section>
    </div>
    {subject ? <div className="omr-print-stage">{Array.from({ length: pageCount }, (_, pageNumber) => <OmrPage key={pageNumber} exam={exam} subject={subject} student={student} settings={settings} pageNumber={pageNumber} pageCount={pageCount}/>)}</div> : null}
  </div>;
}

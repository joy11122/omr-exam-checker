import Link from "next/link";
import mongoose from "mongoose";
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, KeyRound, ListChecks } from "lucide-react";
import { auth } from "@/auth";
import { saveAnswerKey } from "@/app/actions/exams";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Exam } from "@/models";

type ExamRecord = { _id: mongoose.Types.ObjectId; title: string; examCode: string; status: string; description?: string; durationMinutes: number; subjects: { _id: mongoose.Types.ObjectId; name: string; questionCount: number; marksPerQuestion: number; negativeMarksPerQuestion: number; answerKey: { questionNumber: number; option: string }[] }[] };
type Props = { params: Promise<{ examId: string }>; searchParams: Promise<{ institutionId?: string; saved?: string; error?: string }> };
export default async function ExamDetailPage({ params, searchParams }: Props) {
  const [{ examId }, query] = await Promise.all([params, searchParams]);
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id) || !mongoose.isValidObjectId(examId)) return null;
  const current = await getCurrentInstitution(session.user.id, query.institutionId);
  if (!current) return <section className="management-page"><h1>Exam unavailable</h1><Link href="/dashboard">Return to dashboard</Link></section>;
  await connectToDatabase();
  const exam = await Exam.findOne({ _id: new mongoose.Types.ObjectId(examId), institutionId: new mongoose.Types.ObjectId(current.institutionId) }).lean().exec() as unknown as ExamRecord | null;
  if (!exam) return <section className="management-page"><h1>Exam not found</h1><Link href={"/exams?institutionId=" + current.institutionId}>Back to exams</Link></section>;
  const canEdit = ["owner", "admin", "teacher"].includes(String(current.role));
  const questionTotal = exam.subjects.reduce((sum: number, subject: { questionCount: number }) => sum + subject.questionCount, 0);
  const errorMessage = query.error === "invalid_answer_key" ? "Use one answer per line in the format 1,A. Question numbers must be unique and within the subject range." : query.error === "subject_not_found" ? "The selected subject could not be found." : null;
  return <div className="management-page">
    <div className="page-topline"><span className="eyebrow">EXAM CONFIGURATION</span><span className="secure-chip"><KeyRound size={14}/> Institution scoped</span></div>
    <Link className="back-link" href={"/exams?institutionId=" + current.institutionId}><ArrowLeft size={15}/> Back to exams</Link>
    <section className="management-intro"><p className="muted-copy">{exam.examCode} · {exam.status}</p><h1>{exam.title}</h1><p>{exam.description || "Configure subject answer keys and review the exam structure."}</p></section>
    {query.saved ? <div className="form-alert success"><CheckCircle2 size={16}/> Answer key saved successfully.</div> : null}
    {errorMessage ? <div className="form-alert error"><AlertCircle size={16}/>{errorMessage}</div> : null}
    <div className="omr-detail-actions"><Link className="button button-secondary" href={"/exams/" + examId + "/sheets?institutionId=" + current.institutionId}><FileText size={16}/> Design &amp; print OMR sheets</Link></div>
    <section className="management-panel">
      <div className="management-panel-heading"><div><h2>Exam structure</h2><p>{exam.subjects.length} subjects · {questionTotal} questions · {exam.durationMinutes} minutes</p></div><ListChecks size={20}/></div>
      <div className="student-list">{exam.subjects.map((subject: { _id: mongoose.Types.ObjectId; name: string; questionCount: number; marksPerQuestion: number; negativeMarksPerQuestion: number; answerKey: { questionNumber: number; option: string }[] }) => {
        const answerText = subject.answerKey.map((answer) => String(answer.questionNumber) + "," + answer.option).join("\n");
        const totalMarks = subject.questionCount * subject.marksPerQuestion;
        return <article className="management-panel subject-panel" key={String(subject._id)}>
          <div className="management-panel-heading"><div><h2>{subject.name}</h2><p>{subject.questionCount} questions · {totalMarks} marks · −{subject.negativeMarksPerQuestion} per wrong answer</p></div><span className="count-pill">{subject.answerKey.length}/{subject.questionCount} keys</span></div>
          <form action={saveAnswerKey} className="management-form">
            <input type="hidden" name="institutionId" value={current.institutionId}/>
            <input type="hidden" name="examId" value={examId}/>
            <input type="hidden" name="subjectId" value={String(subject._id)}/>
            <label>Correct answers <span className="helper-copy">Format: question number, option (A–D), one per line</span><textarea name="answerKeyText" rows={Math.min(10, Math.max(4, subject.questionCount))} defaultValue={answerText} disabled={!canEdit} placeholder={"1,A\n2,C\n3,B\n4,D"}/></label>
            <p className="helper-copy">You can save a partial key and complete it later. Duplicate or out-of-range question numbers are rejected.</p>
            {canEdit ? <button className="button button-primary" type="submit">Save {subject.name} answer key <KeyRound size={15}/></button> : <p className="helper-copy">You have read-only access to this answer key.</p>}
          </form>
        </article>;
      })}</div>
    </section>
  </div>;
}

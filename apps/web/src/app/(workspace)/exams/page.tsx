import Link from "next/link";
import mongoose from "mongoose";
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, Plus, Timer } from "lucide-react";
import { auth } from "@/auth";
import { createExam } from "@/app/actions/exams";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Exam, Institution, Membership } from "@/models";

type Props = { searchParams: Promise<{ institutionId?: string; error?: string; created?: string }> };
const errors: Record<string, string> = {
  invalid_exam: "Review the exam details, subject rows and schedule.",
  forbidden: "You do not have permission to create exams.",
  exam_code_exists: "That exam code already exists in this institution.",
  create_failed: "The exam could not be created. Please try again.",
  invalid_answer_key: "The answer key format is invalid.",
  exam_not_found: "The requested exam was not found.",
  save_failed: "The answer key could not be saved.",
};
export default async function ExamsPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) return null;
  await connectToDatabase();
  const memberships = await Membership.find({ userId: new mongoose.Types.ObjectId(session.user.id) }).select("institutionId").lean();
  const institutions = await Institution.find({ _id: { $in: memberships.map((item) => item.institutionId) } }).select("name").lean();
  const current = await getCurrentInstitution(session.user.id, params.institutionId);
  if (!current) return <section className="management-page"><h1>Exams</h1><p>Create an institution before setting up exams.</p><Link className="button button-primary" href="/dashboard">Go to dashboard</Link></section>;
  const exams = await Exam.find({ institutionId: new mongoose.Types.ObjectId(current.institutionId) }).sort({ createdAt: -1 }).limit(50).lean();
  const canCreate = ["owner", "admin", "teacher"].includes(String(current.role));
  const totalQuestions = exams.reduce((sum, exam) => sum + exam.subjects.reduce((count: number, subject: { questionCount: number }) => count + subject.questionCount, 0), 0);
  return <div className="management-page">
    <div className="page-topline"><span className="eyebrow">ASSESSMENT WORKSPACE</span><span className="secure-chip"><ClipboardList size={14}/>{current.institution.name}</span></div>
    <section className="management-intro"><p className="muted-copy">Plan and prepare assessments</p><h1>Exams</h1><p>Create exam sessions, organize subjects and prepare answer keys for OMR evaluation.</p></section>
    <div className="institution-switcher">{institutions.map((item) => <Link key={String(item._id)} className={String(item._id) === current.institutionId ? "switcher-link active" : "switcher-link"} href={"/exams?institutionId=" + item._id}>{item.name}</Link>)}</div>
    {params.created ? <div className="form-alert success"><CheckCircle2 size={16}/> Exam created. You can now configure its answer keys.</div> : null}
    {params.error && errors[params.error] ? <div className="form-alert error"><AlertCircle size={16}/>{errors[params.error]}</div> : null}
    <div className="management-grid">
      <section className="management-panel">
        <div className="management-panel-heading"><div><h2>Exam library</h2><p>{exams.length} exams · {totalQuestions} configured questions</p></div><span className="count-pill">{exams.length}</span></div>
        {exams.length ? <div className="student-list">{exams.map((exam) => {
          const questions = exam.subjects.reduce((sum: number, subject: { questionCount: number }) => sum + subject.questionCount, 0);
          const keys = exam.subjects.filter((subject: { answerKey: unknown[] }) => subject.answerKey.length > 0).length;
          return <article className="student-row" key={String(exam._id)}>
            <div className="student-avatar"><ClipboardList size={18}/></div>
            <div className="student-copy"><strong>{exam.title}</strong><small>{exam.examCode} · {exam.subjects.length} subjects · {questions} questions</small><small>{keys}/{exam.subjects.length} answer keys configured</small></div>
            <span className="count-pill">{exam.status}</span>
            <Link className="button button-secondary" href={"/exams/" + exam._id + "?institutionId=" + current.institutionId}>Manage</Link>
          </article>;
        })}</div> : <div className="empty-state"><span className="empty-icon"><ClipboardList size={22}/></span><strong>No exams yet</strong><p>Create your first exam to configure subjects and answer keys.</p></div>}
      </section>
      {canCreate ? <section className="management-panel">
        <div className="management-panel-heading"><div><h2>Create an exam</h2><p>Start with its schedule and subject structure.</p></div><Plus size={19}/></div>
        <form action={createExam} className="management-form">
          <input type="hidden" name="institutionId" value={current.institutionId}/>
          <label>Exam name<input name="title" required minLength={3} maxLength={120} placeholder="Annual Examination 2027"/></label>
          <label>Exam code<input name="examCode" required minLength={2} maxLength={30} pattern="[A-Za-z0-9_-]+" placeholder="ANNUAL-2027"/></label>
          <label>Description<textarea name="description" rows={2} maxLength={500} placeholder="Optional notes for exam staff"/></label>
          <div className="form-two-columns"><label>Start date & time<input name="startsAt" type="datetime-local"/></label><label>Duration (minutes)<input name="durationMinutes" type="number" min={5} max={600} defaultValue={120} required/></label></div>
          <label>Subjects <span className="helper-copy">One subject per line: name,questions,marks,negative marks</span><textarea name="subjects" rows={5} required placeholder={"Mathematics,25,1,0.25\nEnglish,25,1,0.25\nScience,30,1,0.25"}/></label>
          <p className="helper-copy">Up to 20 subjects and 1,000 questions per exam. Use 0 for no negative marking.</p>
          <button className="button button-primary" type="submit">Create exam <Plus size={15}/></button>
        </form>
      </section> : null}
    </div>
    <div className="helper-copy"><CalendarClock size={14}/> Scheduled exams remain editable until exam delivery is introduced in a later phase. <Timer size={14}/> Maximum 50 recent exams shown.</div>
  </div>;
}

import Link from "next/link";
import mongoose from "mongoose";
import { Calculator, Download, FileCheck2, Info, Trophy } from "lucide-react";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Exam } from "@/models";
import { ExamResult } from "@/models/exam-result";
import { GradeExamButton } from "@/components/results/grade-exam-button";
import styles from "./results.module.css";

type ExamRow = {
  _id: mongoose.Types.ObjectId;
  title: string;
  examCode: string;
  subjects: Array<{ name: string; questionCount: number; answerKey: Array<{ questionNumber: number }> }>;
};
type ResultRow = {
  _id: mongoose.Types.ObjectId;
  examTitle: string;
  examCode: string;
  studentCode: string;
  studentName: string;
  className?: string;
  section?: string;
  rollNumber?: string;
  totalMarksObtained: number;
  totalMaximumMarks: number;
  percentage: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalBlank: number;
  revision: number;
};

export default async function ResultsPage() {
  const session = await auth();
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) return null;
  const institution = await getCurrentInstitution(session.user.id);
  if (!institution) return <section className="management-page"><h1>Institution unavailable</h1><p>Select or create an institution before viewing results.</p></section>;
  await connectToDatabase();
  const institutionId = new mongoose.Types.ObjectId(institution.institutionId);
  const [exams, results] = await Promise.all([
    Exam.find({ institutionId }).sort({ createdAt: -1 }).select("_id title examCode subjects").limit(100).lean().exec() as unknown as Promise<ExamRow[]>,
    ExamResult.aggregate([
      { $match: { institutionId } },
      { $sort: { revision: -1, calculatedAt: -1 } },
      { $group: { _id: { examId: "$examId", studentId: "$studentId" }, result: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$result" } },
      { $sort: { calculatedAt: -1 } },
      { $limit: 100 },
    ]).exec() as Promise<ResultRow[]>,
  ]);

  return (
    <div className="management-page">
      <div className="page-topline"><span className="eyebrow">ASSESSMENT</span><span className="secure-chip"><FileCheck2 size={14}/> Reviewed answers only</span></div>
      <section className="management-intro">
        <p className="muted-copy">ASSESSMENT WORKSPACE</p>
        <h1>Results</h1>
        <p>Calculate marks from examiner-reviewed OMR answers, inspect candidate performance, and export institution results.</p>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div><span className={styles.icon}><Calculator size={18}/></span><div><h2>Calculate exam results</h2><p>Only fully reviewed candidate sheets with complete answer keys are eligible.</p></div></div>
        </div>
        {exams.length ? <div className={styles.examList}>
          {exams.map((exam) => {
            const complete = exam.subjects.every((subject) => subject.answerKey.length === subject.questionCount);
            const questionCount = exam.subjects.reduce((sum, subject) => sum + subject.questionCount, 0);
            return <article className={styles.examRow} key={String(exam._id)}>
              <div className={styles.examInfo}>
                <strong>{exam.title}</strong>
                <span>{exam.examCode} · {exam.subjects.length} subjects · {questionCount} questions</span>
                <small>{complete ? "Answer keys complete" : "Complete all subject answer keys first"}</small>
              </div>
              <div className={styles.examActions}>
                <Link className="button button-secondary" href={"/exams/" + exam._id}>Answer keys</Link>
                <GradeExamButton examId={String(exam._id)} disabled={!complete}/>
              </div>
            </article>;
          })}
        </div> : <div className="empty-state"><span className="empty-icon"><Calculator size={20}/></span><strong>No exams yet</strong><p>Create an exam and configure its answer keys to begin grading.</p><Link className="button button-secondary" href="/exams">Open exams</Link></div>}
        <p className={styles.note}><Info size={15}/> Blank answers receive zero. Wrong, multiple-marked, and unreadable answers receive the configured negative mark. Results are stored as revisioned calculations; unchanged source data will not create duplicate revisions.</p>
      </section>
      <section className={styles.panel}>
        <div className={styles.resultsHeading}>
          <div><span className={styles.icon}><Trophy size={18}/></span><div><h2>Calculated results</h2><p>Latest calculation per candidate · showing up to 100</p></div></div>
          <a className="button button-secondary" href="/api/results/export"><Download size={15}/> Export CSV</a>
        </div>
        {results.length ? <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Candidate</th><th>Exam</th><th>Correct / Wrong / Blank</th><th>Marks</th><th>Percentage</th><th>Revision</th></tr></thead>
            <tbody>{results.map((result) => <tr key={String(result._id)}>
              <td><Link className={styles.resultLink} href={"/results/" + result._id}><strong>{result.studentName}</strong><span>{result.studentCode}{result.className ? " · " + result.className : ""}{result.section ? " · " + result.section : ""}{result.rollNumber ? " · Roll " + result.rollNumber : ""}</span></Link></td>
              <td><strong>{result.examTitle}</strong><span>{result.examCode}</span></td>
              <td>{result.totalCorrect} / {result.totalIncorrect} / {result.totalBlank}</td>
              <td><strong>{result.totalMarksObtained}</strong><span>of {result.totalMaximumMarks}</span></td>
              <td><strong>{result.percentage.toFixed(2)}%</strong></td>
              <td>#{result.revision}</td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="empty-state"><span className="empty-icon"><Trophy size={20}/></span><strong>No calculated results yet</strong><p>Complete answer keys, match scanned sheets to students, recognize each page, and submit examiner reviews.</p></div>}
      </section>
    </div>
  );
}

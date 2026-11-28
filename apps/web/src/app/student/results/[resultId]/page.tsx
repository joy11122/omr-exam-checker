import type { Metadata } from "next";
import Link from "next/link";
import mongoose from "mongoose";
import { ArrowLeft, BookOpenCheck, CheckCircle2, CircleAlert, MinusCircle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getStudentPortalSession } from "@/lib/student-portal/access";
import { ExamResult } from "@/models/exam-result";
import { StudentLogoutButton } from "@/components/student-portal/student-logout-button";
import styles from "../student-results.module.css";

export const metadata: Metadata = { title: "Published Exam Result | OMR Checker", robots: { index: false, follow: false } };
type StudentResultRecord = {
  examTitle: string;
  examCode: string;
  studentName: string;
  studentCode: string;
  totalCorrect: number;
  totalIncorrect: number;
  totalBlank: number;
  totalMarksObtained: number;
  totalMaximumMarks: number;
  percentage: number;
  revision: number;
  publishedAt?: Date | null;
  subjects: Array<{
    subjectId: mongoose.Types.ObjectId;
    subjectName: string;
    questionCount: number;
    correctCount: number;
    incorrectCount: number;
    blankCount: number;
    marksObtained: number;
    maximumMarks: number;
    questions: Array<{
      questionNumber: number;
      correctOption: string;
      submittedAnswer: string;
      outcome: "correct" | "incorrect" | "blank";
      marksAwarded: number;
    }>;
  }>;
};
type Props = { params: Promise<{ resultId: string }> };

export default async function StudentResultDetail({ params }: Props) {
  const [{ resultId }, portal] = await Promise.all([params, getStudentPortalSession()]);
  if (!portal) redirect("/student/results");
  if (!mongoose.isValidObjectId(resultId)) notFound();
  const result = await ExamResult.findOne({
    _id: new mongoose.Types.ObjectId(resultId),
    institutionId: new mongoose.Types.ObjectId(portal.institutionId),
    studentId: new mongoose.Types.ObjectId(portal.studentId),
    publicationStatus: "published",
  }).lean().exec() as unknown as StudentResultRecord | null;
  if (!result) notFound();

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/student/results" className={styles.brand}><BookOpenCheck size={20}/> OMR Checker</Link><StudentLogoutButton/></header>
    <div className={styles.intro}><Link href="/student/results" className="back-link"><ArrowLeft size={15}/> All results</Link><p>OFFICIAL PUBLISHED RESULT</p><h1>{result.examTitle}</h1><span>{result.examCode} · {result.studentName} · {result.studentCode}</span></div>
    <section className={styles.panel}>
      <div className={styles.panelHeading}><div><BookOpenCheck size={19}/><div><h2>Overall performance</h2><p>Published {result.publishedAt ? new Date(result.publishedAt).toLocaleString() : "by your institution"} · Revision #{result.revision}</p></div></div></div>
      <div className="metric-grid">
        <div className="metric-card"><span className="metric-label">Marks obtained</span><strong>{result.totalMarksObtained} / {result.totalMaximumMarks}</strong></div>
        <div className="metric-card"><span className="metric-label">Percentage</span><strong>{result.percentage.toFixed(2)}%</strong></div>
        <div className="metric-card"><span className="metric-label">Correct · Wrong · Blank</span><strong>{result.totalCorrect} · {result.totalIncorrect} · {result.totalBlank}</strong></div>
      </div>
    </section>
    {result.subjects.map((subject) => <section className={styles.panel} style={{ marginTop: 16 }} key={String(subject.subjectId)}>
      <div className={styles.panelHeading}><div><div><h2>{subject.subjectName}</h2><p>{subject.questionCount} questions · {subject.correctCount} correct · {subject.incorrectCount} incorrect · {subject.blankCount} blank</p></div></div><strong>{subject.marksObtained} / {subject.maximumMarks}</strong></div>
      <div className={styles.list}>{subject.questions.map((question) => <article className={styles.result} key={question.questionNumber}>
        <div><strong>Question {question.questionNumber}</strong><span>Your answer: {question.submittedAnswer} · Correct answer: {question.correctOption}</span></div>
        <div className={styles.score}>{question.outcome === "correct" ? <CheckCircle2 size={16}/> : question.outcome === "blank" ? <MinusCircle size={16}/> : <CircleAlert size={16}/>}<strong>{question.marksAwarded > 0 ? "+" : ""}{question.marksAwarded}</strong></div>
      </article>)}</div>
    </section>)}
  </main>;
}

import Link from "next/link";
import mongoose from "mongoose";
import { ArrowLeft, CheckCircle2, CircleAlert, FileCheck2, MinusCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { ExamResult } from "@/models/exam-result";
import styles from "./detail.module.css";

type Props = { params: Promise<{ resultId: string }> };
type ResultRecord = {
  _id: mongoose.Types.ObjectId;
  examTitle: string;
  examCode: string;
  studentCode: string;
  studentName: string;
  className?: string;
  section?: string;
  rollNumber?: string;
  subjects: Array<{
    subjectId: mongoose.Types.ObjectId;
    subjectName: string;
    questionCount: number;
    correctCount: number;
    incorrectCount: number;
    blankCount: number;
    marksObtained: number;
    maximumMarks: number;
    percentage: number;
    questions: Array<{
      questionNumber: number;
      correctOption: string;
      submittedAnswer: string;
      outcome: "correct" | "incorrect" | "blank";
      marksAwarded: number;
    }>;
  }>;
  totalCorrect: number;
  totalIncorrect: number;
  totalBlank: number;
  totalMarksObtained: number;
  totalMaximumMarks: number;
  percentage: number;
  revision: number;
  calculatedAt: Date;
  publicationStatus?: "draft" | "published";
  notificationStatus?: string;
};

export default async function ResultDetailPage({ params }: Props) {
  const [{ resultId }, session] = await Promise.all([params, auth()]);
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) return null;
  if (!mongoose.isValidObjectId(resultId)) notFound();
  const institution = await getCurrentInstitution(session.user.id);
  if (!institution) notFound();
  await connectToDatabase();
  const result = await ExamResult.findOne({
    _id: new mongoose.Types.ObjectId(resultId),
    institutionId: new mongoose.Types.ObjectId(institution.institutionId),
  }).lean().exec() as unknown as ResultRecord | null;
  if (!result) notFound();

  return (
    <div className="management-page">
      <div className="page-topline"><span className="eyebrow">RESULT DETAILS</span><span className="secure-chip"><FileCheck2 size={14}/> Institution scoped</span></div>
      <Link className="back-link" href="/results"><ArrowLeft size={15}/> Back to results</Link>
      <section className="management-intro">
        <p className="muted-copy">{result.examCode} · Revision #{result.revision}</p>
        <h1>{result.studentName}</h1>
        <p>{result.studentCode}{result.className ? " · " + result.className : ""}{result.section ? " · " + result.section : ""}{result.rollNumber ? " · Roll " + result.rollNumber : ""} · {result.examTitle}</p>
      </section>
      <section className={styles.summary}>
        <div><span>Marks obtained</span><strong>{result.totalMarksObtained} / {result.totalMaximumMarks}</strong></div>
        <div><span>Percentage</span><strong>{result.percentage.toFixed(2)}%</strong></div>
        <div><span>Correct · Wrong · Blank</span><strong>{result.totalCorrect} · {result.totalIncorrect} · {result.totalBlank}</strong></div>
        <p>Calculated {new Date(result.calculatedAt).toLocaleString()} · Snapshot revision #{result.revision} · {result.publicationStatus === "published" ? "Published" : "Not published"}</p><p>Notification: {String(result.notificationStatus ?? "not_sent").replaceAll("_", " ")}</p>
      </section>
      {result.subjects.map((subject) => (
        <section className={styles.subject} key={String(subject.subjectId)}>
          <div className={styles.subjectHeading}>
            <div><h2>{subject.subjectName}</h2><p>{subject.questionCount} questions · {subject.correctCount} correct · {subject.incorrectCount} incorrect · {subject.blankCount} blank</p></div>
            <strong>{subject.marksObtained} / {subject.maximumMarks}</strong>
          </div>
          <div className={styles.questions}>
            {subject.questions.map((question) => (
              <article className={styles.question} key={question.questionNumber}>
                <div className={styles.questionNumber}>Q{question.questionNumber}</div>
                <div className={styles.answerCopy}>
                  <span>Student: <strong>{question.submittedAnswer}</strong></span>
                  <span>Key: <strong>{question.correctOption}</strong></span>
                </div>
                <div className={styles.outcome}>
                  {question.outcome === "correct" ? <CheckCircle2 size={16}/> : question.outcome === "blank" ? <MinusCircle size={16}/> : <CircleAlert size={16}/>}
                  <span>{question.outcome}</span>
                  <strong>{question.marksAwarded > 0 ? "+" : ""}{question.marksAwarded}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

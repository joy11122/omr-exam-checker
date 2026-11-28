import type { Metadata } from "next";
import Link from "next/link";
import mongoose from "mongoose";
import { BookOpenCheck, LockKeyhole, Trophy } from "lucide-react";
import { getStudentPortalSession } from "@/lib/student-portal/access";
import { ExamResult } from "@/models/exam-result";
import { Student } from "@/models";
import { StudentLogoutButton } from "@/components/student-portal/student-logout-button";
import styles from "./student-results.module.css";

export const metadata: Metadata = { title: "Student Results | OMR Checker", robots: { index: false, follow: false } };
type StudentRecord = { fullName: string; studentCode: string; className?: string; section?: string };
type ResultRow = {
  _id: mongoose.Types.ObjectId;
  examTitle: string;
  examCode: string;
  studentName: string;
  studentCode: string;
  totalMarksObtained: number;
  totalMaximumMarks: number;
  percentage: number;
  revision: number;
  publishedAt: Date | null;
};
type Props = { searchParams: Promise<{ error?: string }> };

export default async function StudentResultsPage({ searchParams }: Props) {
  const params = await searchParams;
  const portal = await getStudentPortalSession();
  if (!portal) {
    return <main className={styles.page}><section className={styles.card}>
      <span className={styles.brand}><BookOpenCheck size={20}/> OMR Checker · Student Portal</span>
      <span className={styles.lock}><LockKeyhole size={22}/></span>
      <h1>View your exam results</h1>
      <p>Open the secure access link sent to your registered student email. For your protection, each link can be used once and expires after 30 minutes.</p>
      {params.error === "invalid-link" ? <p className={styles.error}>This access link is invalid, expired, or already used. Ask your institution to send a new link.</p> : null}
      {params.error === "unavailable" ? <p className={styles.error}>The portal is temporarily unavailable. Please try again later.</p> : null}
    </section></main>;
  }

  const studentQuery = Student.findOne({
    _id: new mongoose.Types.ObjectId(portal.studentId),
    institutionId: new mongoose.Types.ObjectId(portal.institutionId),
  }).select("fullName studentCode className section").lean().exec() as unknown as Promise<StudentRecord | null>;
  const resultsQuery = ExamResult.aggregate([
    { $match: { institutionId: new mongoose.Types.ObjectId(portal.institutionId), studentId: new mongoose.Types.ObjectId(portal.studentId), publicationStatus: "published" } },
    { $sort: { revision: -1, publishedAt: -1 } },
    { $group: { _id: "$examId", result: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$result" } },
    { $sort: { publishedAt: -1 } },
    { $limit: 100 },
    { $project: { examTitle: 1, examCode: 1, studentName: 1, studentCode: 1, totalMarksObtained: 1, totalMaximumMarks: 1, percentage: 1, revision: 1, publishedAt: 1 } },
  ]).exec() as Promise<ResultRow[]>;
  const [student, results] = await Promise.all([studentQuery, resultsQuery]);

  if (!student) return <main className={styles.page}><section className={styles.card}><h1>Student record unavailable</h1><p>Contact your institution to restore access.</p></section></main>;

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/student/results" className={styles.brand}><BookOpenCheck size={20}/> OMR Checker</Link><StudentLogoutButton/></header>
    <section className={styles.intro}><p>STUDENT PORTAL</p><h1>Hello, {student.fullName}</h1><span>{student.studentCode}{student.className ? " · " + student.className : ""}{student.section ? " · Section " + student.section : ""}</span></section>
    <section className={styles.panel}><div className={styles.panelHeading}><div><Trophy size={19}/><div><h2>Published results</h2><p>Only results released by your institution appear here.</p></div></div><span>{results.length} results</span></div>
      {results.length ? <div className={styles.list}>{results.map((result) => <Link className={styles.result} key={String(result._id)} href={"/student/results/" + result._id}>
        <div><strong>{result.examTitle}</strong><span>{result.examCode} · Revision #{result.revision}</span></div>
        <div className={styles.score}><strong>{result.totalMarksObtained} / {result.totalMaximumMarks}</strong><span>{result.percentage.toFixed(2)}%</span></div>
      </Link>)}</div> : <div className={styles.empty}><Trophy size={24}/><strong>No results published yet</strong><p>Your institution has not released any exam results to this portal.</p></div>}
    </section>
    <p className={styles.privacy}>Your results are private and can only be accessed through your secure student portal session.</p>
  </main>;
}

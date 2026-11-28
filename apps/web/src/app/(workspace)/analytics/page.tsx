import Link from "next/link";
import mongoose from "mongoose";
import { BarChart3, Download, Trophy } from "lucide-react";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Exam, Institution, Membership } from "@/models";
import { getInstitutionAnalytics } from "@/lib/analytics/queries";
import { PrintReportButton } from "@/components/analytics/print-report-button";
import styles from "./analytics.module.css";

type Props = { searchParams: Promise<{ examId?: string; institutionId?: string }> };
export default async function AnalyticsPage({ searchParams }: Props) {
  const [params, session] = await Promise.all([searchParams, auth()]);
  if (!session?.user?.id || !mongoose.isValidObjectId(session.user.id)) return null;
  await connectToDatabase();
  const institution = await getCurrentInstitution(session.user.id, params.institutionId);
  if (!institution) return <section className="management-page"><h1>Analytics unavailable</h1><p>Create or join an institution to view reports.</p></section>;

  const memberships = await Membership.find({ userId: new mongoose.Types.ObjectId(session.user.id) }).select("institutionId").lean();
  const institutions = await Institution.find({ _id: { $in: memberships.map((item) => item.institutionId) } }).select("name").lean();
  const exams = await Exam.find({ institutionId: new mongoose.Types.ObjectId(institution.institutionId) })
    .select("_id title examCode").sort({ createdAt: -1 }).limit(100).lean() as unknown as Array<{_id: mongoose.Types.ObjectId; title: string; examCode: string}>;
  const selectedExamId = params.examId && exams.some((exam) => String(exam._id) === params.examId) ? params.examId : undefined;
  const analytics = await getInstitutionAnalytics(institution.institutionId, selectedExamId);
  const maxAverage = Math.max(1, ...analytics.byExam.map((item) => item.averagePercentage));
  const selectedExam = exams.find((exam) => String(exam._id) === selectedExamId);

  return <div className={"management-page " + styles.page}>
    <div className="page-topline"><span className="eyebrow">INSTITUTION INSIGHTS</span><span className="secure-chip"><BarChart3 size={14}/> Published results only</span></div>
    <section className="management-intro"><p className="muted-copy">Understand performance across your institution</p><h1>Analytics & reports</h1><p>Compare exam outcomes, identify class and subject trends, and review merit positions using the latest published result revision.</p></section>
    <nav className={styles.institutions} aria-label="Choose institution">{institutions.map((item) => <Link key={String(item._id)} className={String(item._id) === institution.institutionId ? styles.activeInstitution : ""} href={"/analytics?institutionId=" + item._id}>{item.name}</Link>)}</nav>
    <section className={styles.metrics} aria-label="Institution performance summary">
      <article><span>Published candidate results</span><strong>{analytics.summary.candidates.toLocaleString()}</strong><small>Latest published revision per candidate and exam</small></article>
      <article><span>Exams with results</span><strong>{analytics.summary.exams.toLocaleString()}</strong><small>Across this institution</small></article>
      <article><span>Average percentage</span><strong>{analytics.summary.averagePercentage.toFixed(2)}%</strong><small>Across published candidate results</small></article>
      <article><span>Highest percentage</span><strong>{analytics.summary.highestPercentage.toFixed(2)}%</strong><small>Lowest: {analytics.summary.lowestPercentage.toFixed(2)}%</small></article>
    </section>
    <section className={styles.panel}>
      <div className={styles.heading}><div><h2>Exam comparison</h2><p>Average percentage across published results for each exam.</p></div><a className="button button-secondary" href={"/api/analytics/export?institutionId=" + institution.institutionId}><Download size={15}/> Export CSV</a></div>
      {analytics.byExam.length ? <div className={styles.chart} aria-label="Average percentage by exam">
        {analytics.byExam.map((item) => <div className={styles.barRow} key={item.examId}><div className={styles.barLabel}><strong>{item.examTitle}</strong><span>{item.candidates} candidates · {item.averagePercentage.toFixed(1)}%</span></div><div className={styles.track} role="img" aria-label={item.examTitle + " average " + item.averagePercentage.toFixed(1) + " percent"}><span style={{width: Math.min(100, Math.max(0, item.averagePercentage / maxAverage * 100)) + "%"}} /></div></div>)}
      </div> : <p className={styles.empty}>No published exam results are available yet.</p>}
    </section>
    <section className={styles.panel}>
      <div className={styles.heading}><div><h2>Class performance</h2><p>Class and section averages across published results.</p></div></div>
      {analytics.classPerformance.length ? <div className={styles.tableWrap}><table><thead><tr><th>Class</th><th>Section</th><th>Candidates</th><th>Average</th><th>Highest</th></tr></thead><tbody>{analytics.classPerformance.map((item) => <tr key={item.className + item.section}><td>{item.className}</td><td>{item.section || "—"}</td><td>{item.candidates}</td><td>{item.averagePercentage.toFixed(2)}%</td><td>{item.highestPercentage.toFixed(2)}%</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No class information is available in published results.</p>}
    </section>
    <section className={styles.panel}>
      <div className={styles.heading}><div><h2>Subject performance</h2><p>Aggregated subject averages and answer outcomes.</p></div></div>
      {analytics.subjectPerformance.length ? <div className={styles.tableWrap}><table><thead><tr><th>Subject</th><th>Candidate results</th><th>Average</th><th>Correct</th><th>Incorrect</th><th>Blank</th></tr></thead><tbody>{analytics.subjectPerformance.map((item) => <tr key={item.subjectName}><td>{item.subjectName}</td><td>{item.candidates}</td><td>{item.averagePercentage.toFixed(2)}%</td><td>{item.correct.toLocaleString()}</td><td>{item.incorrect.toLocaleString()}</td><td>{item.blank.toLocaleString()}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No subject-level results are available yet.</p>}
    </section>
    <section className={styles.panel}>
      <div className={styles.heading}><div><h2><Trophy size={17}/> Student merit list</h2><p>Rank candidates within one exam. Equal percentage and marks share a rank (1, 1, 3).</p></div></div>
      <form className={styles.filter} action="/analytics" method="get"><input type="hidden" name="institutionId" value={institution.institutionId}/><label htmlFor="analytics-exam">Exam</label><select id="analytics-exam" name="examId" defaultValue={selectedExamId ?? ""}><option value="">Select an exam</option>{exams.map((exam) => <option key={String(exam._id)} value={String(exam._id)}>{exam.title} ({exam.examCode})</option>)}</select><button className="button button-primary" type="submit">View merit list</button></form>
      {selectedExam ? <><div className={styles.heading}><div><h3>{selectedExam.title}</h3><p>{analytics.rankingCandidateCount} published candidates · displaying top 100</p></div><a className="button button-secondary" href={"/api/analytics/export?institutionId=" + institution.institutionId + "&examId=" + selectedExamId}><Download size={15}/> Export this exam</a></div>
      {analytics.rankingTruncated ? <p className={styles.empty}>This exam has more than 1,000 published candidates. The merit list is limited to the top 1,000 for performance.</p> : null}{analytics.rankings.length ? <div className={styles.tableWrap}><table><thead><tr><th>Rank</th><th>Candidate</th><th>Class</th><th>Marks</th><th>Percentage</th></tr></thead><tbody>{analytics.rankings.map((item) => <tr key={item.studentId}><td><strong>#{item.rank}</strong></td><td><strong>{item.studentName}</strong><small>{item.studentCode}</small></td><td>{item.className || "—"}{item.section ? " · " + item.section : ""}</td><td>{item.totalMarksObtained} / {item.totalMaximumMarks}</td><td>{item.percentage.toFixed(2)}%</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No published candidates for this exam.</p>}</> : <p className={styles.empty}>Select an exam to view its merit list.</p>}
    </section>
    <div className={styles.printActions}><p>Print this report or save it as PDF using your browser.</p><PrintReportButton/></div>
    <p className={styles.disclaimer}>Pass/fail rates are not shown because the exam model has no configured pass threshold. Draft and unpublished results are excluded.</p>
  </div>;
}

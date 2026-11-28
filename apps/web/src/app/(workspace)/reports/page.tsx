import Link from "next/link";
import mongoose from "mongoose";
import { BarChart3, Download, TrendingUp, Users, GraduationCap } from "lucide-react";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { Exam, Institution, Membership, Student } from "@/models";
import { parseReportFilters } from "@/lib/analytics/report-filters";
import { getAdvancedInstitutionReports } from "@/lib/analytics/advanced-reports";
import { PrintReportButton } from "@/components/analytics/print-report-button";
import styles from "./reports.module.css";

type Props={searchParams:Promise<{institutionId?:string;from?:string;to?:string;className?:string;examId?:string}>};
export default async function AdvancedReportsPage({searchParams}:Props){
 const [params,session]=await Promise.all([searchParams,auth()]);
 if(!session?.user?.id||!mongoose.isValidObjectId(session.user.id))return null;
 await connectToDatabase();
 const institution=await getCurrentInstitution(session.user.id,params.institutionId);
 if(!institution)return <section className="management-page"><h1>Reports unavailable</h1><p>Create or join an institution to view reports.</p></section>;
 const parsed=parseReportFilters(params);
 if(!parsed.success)return <section className="management-page"><h1>Invalid report filters</h1><p>{parsed.error}</p><Link href={"/reports?institutionId="+institution.institutionId}>Clear filters</Link></section>;
 const tenantId=new mongoose.Types.ObjectId(institution.institutionId);
 const [memberships,exams,classes,reports]=await Promise.all([
  Membership.find({userId:new mongoose.Types.ObjectId(session.user.id)}).select("institutionId").lean(),
  Exam.find({institutionId:tenantId}).select("_id title examCode").sort({createdAt:-1}).limit(100).lean() as unknown as Promise<Array<{_id:mongoose.Types.ObjectId;title:string;examCode:string}>>,
  Student.distinct("className",{institutionId:tenantId,status:"active"}),
  getAdvancedInstitutionReports(institution.institutionId,parsed.data)
 ]);
 const institutions=await Institution.find({_id:{$in:memberships.map(m=>m.institutionId)}}).select("name").lean();
 const examId=parsed.data.examId&&exams.some(e=>String(e._id)===parsed.data.examId)?parsed.data.examId:"";
 const query=new URLSearchParams({institutionId:institution.institutionId,...(params.from?{from:params.from}:{}),...(params.to?{to:params.to}:{}),...(params.className?{className:params.className}:{}),...(examId?{examId}:{})});
 const exportUrl="/api/reports/export?"+query.toString();
 const maxAverage=Math.max(1,...reports.examTrend.map(e=>e.average));
 return <div className={"management-page "+styles.page}>
  <div className="page-topline"><span className="eyebrow">ADVANCED INSTITUTION REPORTS</span><span className="secure-chip"><BarChart3 size={14}/> Published results only</span></div>
  <section className="management-intro"><p className="muted-copy">{institution.institution.name}</p><h1>Performance reports</h1><p>Explore progress over time, compare exams and identify class or subject performance gaps.</p></section>
  <nav className={styles.institutions} aria-label="Choose institution">{institutions.map(item=><Link key={String(item._id)} className={String(item._id)===institution.institutionId?styles.active:""} href={"/reports?institutionId="+item._id}>{item.name}</Link>)}</nav>
  <section className={styles.filters}>
   <form action="/reports" method="get"><input type="hidden" name="institutionId" value={institution.institutionId}/>
    <label>Published from<input type="date" name="from" defaultValue={params.from??""}/></label>
    <label>Published to<input type="date" name="to" defaultValue={params.to??""}/></label>
    <label>Class<select name="className" defaultValue={params.className??""}><option value="">All classes</option>{classes.filter((v):v is string=>typeof v==="string"&&!!v.trim()).sort().map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    <label>Exam<select name="examId" defaultValue={examId}><option value="">All exams</option>{exams.map(e=><option key={String(e._id)} value={String(e._id)}>{e.title} ({e.examCode})</option>)}</select></label>
    <button className="button button-primary" type="submit">Apply filters</button><Link className="button button-secondary" href={"/reports?institutionId="+institution.institutionId}>Reset</Link>
   </form>
  </section>
  <div className={styles.actions}><a className="button button-secondary" href={exportUrl}><Download size={15}/> Export filtered CSV</a><PrintReportButton/></div>
  {reports.truncated?<p className={styles.warning} role="status">This report contains more than 5,000 candidate-exam records. Summary calculations use the first 5,001 latest published records; narrow the filters for a complete report.</p>:null}
  <section className={styles.metrics} aria-label="Filtered report summary">
   <article><Users size={17}/><span>Candidate results</span><strong>{reports.overview.candidateResults.toLocaleString()}</strong></article>
   <article><GraduationCap size={17}/><span>Unique students</span><strong>{reports.overview.students.toLocaleString()}</strong></article>
   <article><BarChart3 size={17}/><span>Exams covered</span><strong>{reports.overview.exams.toLocaleString()}</strong></article>
   <article><TrendingUp size={17}/><span>Average percentage</span><strong>{reports.overview.average.toFixed(2)}%</strong></article>
  </section>
  <section className={styles.panel}><div className={styles.heading}><div><h2>Exam performance trend</h2><p>Exam-level average percentage, ordered by publication date.</p></div></div>
   {reports.examTrend.length?<div className={styles.chart}>{reports.examTrend.map(e=><div className={styles.barRow} key={e.examId}><div><strong>{e.title}</strong><small>{e.candidates} candidates · {e.publishedAt?new Date(e.publishedAt).toLocaleDateString():"Date unavailable"}</small></div><div className={styles.track} role="img" aria-label={e.title+" average "+e.average.toFixed(1)+" percent"}><span style={{width:Math.min(100,Math.max(0,e.average/maxAverage*100))+"%"}}/></div><b>{e.average.toFixed(1)}%</b></div>)}</div>:<p className={styles.empty}>No published results match these filters.</p>}
   <p className={styles.range}>Highest overall: {reports.overview.highest.toFixed(2)}% · Lowest overall: {reports.overview.lowest.toFixed(2)}%</p>
  </section>
  <section className={styles.panel}><div className={styles.heading}><div><h2>Class and section performance</h2><p>Compare candidate results across the selected report scope.</p></div></div>
   {reports.classPerformance.length?<div className={styles.tableWrap}><table><thead><tr><th>Class</th><th>Section</th><th>Candidates</th><th>Average</th><th>Highest</th><th>Lowest</th></tr></thead><tbody>{reports.classPerformance.map((r,i)=><tr key={r.className+"-"+r.section+"-"+i}><td>{r.className}</td><td>{r.section||"—"}</td><td>{r.candidates}</td><td>{r.average.toFixed(2)}%</td><td>{r.highest.toFixed(2)}%</td><td>{r.lowest.toFixed(2)}%</td></tr>)}</tbody></table></div>:<p className={styles.empty}>No class performance data available.</p>}
  </section>
  <section className={styles.panel}><div className={styles.heading}><div><h2>Student progress</h2><p>Top 100 students by average percentage across the selected exams.</p></div></div>
   {reports.studentProgress.length?<div className={styles.tableWrap}><table><thead><tr><th>Student</th><th>Class</th><th>Exams</th><th>Average</th><th>Latest result</th><th>Progress timeline</th></tr></thead><tbody>{reports.studentProgress.map(r=><tr key={r.studentId}><td><strong>{r.studentName}</strong><small>{r.studentCode}</small></td><td>{r.className||"—"}</td><td>{r.exams}</td><td>{r.average.toFixed(2)}%</td><td>{r.latestPercentage.toFixed(2)}%</td><td><div className={styles.timeline}>{r.timeline.map((t,i)=><span key={t.examTitle+"-"+i} title={t.examTitle+": "+t.percentage.toFixed(1)+"%"} style={{height:Math.max(4,Math.min(42,t.percentage*.42))+"px"}}/>)}</div></td></tr>)}</tbody></table></div>:<p className={styles.empty}>No student progress is available for this filter.</p>}
  </section>
  <section className={styles.panel}><div className={styles.heading}><div><h2>Subject trends by exam</h2><p>Subject averages and answer outcomes across each exam.</p></div></div>
   {reports.subjectTrend.length?<div className={styles.tableWrap}><table><thead><tr><th>Exam</th><th>Subject</th><th>Candidates</th><th>Average</th><th>Correct</th><th>Incorrect</th><th>Blank</th></tr></thead><tbody>{reports.subjectTrend.map((r,i)=><tr key={r.examTitle+"-"+r.subjectName+"-"+i}><td>{r.examTitle}</td><td>{r.subjectName}</td><td>{r.candidates}</td><td>{r.average.toFixed(2)}%</td><td>{r.correct.toLocaleString()}</td><td>{r.incorrect.toLocaleString()}</td><td>{r.blank.toLocaleString()}</td></tr>)}</tbody></table></div>:<p className={styles.empty}>No subject trends are available.</p>}
  </section>
  <p className={styles.disclaimer}>All reports use the latest published result revision. Draft results are excluded. Progress averages percentages and does not compare raw marks across different exams. Pass/fail is not calculated because no exam pass threshold is configured.</p>
 </div>;
}

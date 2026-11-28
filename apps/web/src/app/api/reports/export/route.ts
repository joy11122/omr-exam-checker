import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectToDatabase } from "@/lib/mongodb/client";
import { getCurrentInstitution } from "@/lib/tenancy/current-institution";
import { requireInstitutionRole } from "@/lib/tenancy/authorization";
import { parseReportFilters } from "@/lib/analytics/report-filters";
import { ExamResult } from "@/models/exam-result";
export const runtime="nodejs";
function cell(value:unknown){
 const raw=String(value??"");
 const safe=typeof value==="string"&&/^[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replaceAll('"','""')+'"';
}
export async function GET(request:Request){
 try{
  const session=await auth();
  if(!session?.user?.id||!mongoose.isValidObjectId(session.user.id))return NextResponse.json({error:"Sign in to export reports."},{status:401});
  const params=new URL(request.url).searchParams;
  const parsed=parseReportFilters({from:params.get("from")??undefined,to:params.get("to")??undefined,className:params.get("className")??undefined,examId:params.get("examId")??undefined});
  if(!parsed.success)return NextResponse.json({error:parsed.error},{status:400});
  const institution=await getCurrentInstitution(session.user.id,params.get("institutionId")??undefined);
  if(!institution)return NextResponse.json({error:"Institution not found."},{status:403});
  await requireInstitutionRole(institution.institutionId,"examiner");
  await connectToDatabase();
  const match:Record<string,unknown>={institutionId:new mongoose.Types.ObjectId(institution.institutionId),publicationStatus:"published"};
  const latest=await ExamResult.aggregate([
   {$match:match},{$sort:{examId:1,studentId:1,revision:-1,calculatedAt:-1,_id:-1}},
   {$group:{_id:{examId:"$examId",studentId:"$studentId"},result:{$first:"$$ROOT"}}},{$replaceRoot:{newRoot:"$result"}},
   ...((parsed.data.from||parsed.data.to||parsed.data.className||parsed.data.examId)?[{$match:{
    ...(parsed.data.from||parsed.data.to?{publishedAt:{...(parsed.data.from?{$gte:parsed.data.from}:{}),...(parsed.data.to?{$lte:parsed.data.to}:{})}}:{}),
    ...(parsed.data.className?{className:parsed.data.className}:{}),
    ...(parsed.data.examId?{examId:new mongoose.Types.ObjectId(parsed.data.examId)}:{})
   }}]:[]),
   {$sort:{examTitle:1,percentage:-1,studentCode:1}},{$limit:10001}
  ]).exec() as Array<Record<string,unknown>>;
  if(latest.length>10000)return NextResponse.json({error:"Export exceeds 10,000 rows. Narrow the filters and retry."},{status:413});
  const header=["Exam","Exam code","Student code","Student name","Class","Section","Roll","Marks","Maximum marks","Percentage","Correct","Incorrect","Blank","Revision","Published at"];
  const rows=[header,...latest.map(r=>[r.examTitle,r.examCode,r.studentCode,r.studentName,r.className,r.section,r.rollNumber,r.totalMarksObtained,r.totalMaximumMarks,Number(r.percentage??0).toFixed(2),r.totalCorrect,r.totalIncorrect,r.totalBlank,r.revision,r.publishedAt?new Date(String(r.publishedAt)).toISOString():""])];
  const csv="\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n");
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="omr-advanced-report.csv"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(error){
  if(error instanceof Error&&error.message==="FORBIDDEN")return NextResponse.json({error:"You do not have permission to export this report."},{status:403});
  console.error("Advanced report export failed",error);
  return NextResponse.json({error:"Unable to export report right now."},{status:500});
 }
}

import "server-only";
import mongoose, { type PipelineStage } from "mongoose";
import { ExamResult } from "@/models/exam-result";
import type { ReportFilters } from "./report-filters";
export type AdvancedInstitutionReports = {
 truncated: boolean;
 overview: { candidateResults:number; students:number; exams:number; average:number; highest:number; lowest:number };
 examTrend: Array<{examId:string;title:string;code:string;publishedAt:string|null;candidates:number;average:number;highest:number;lowest:number}>;
 classPerformance: Array<{className:string;section:string;candidates:number;average:number;highest:number;lowest:number}>;
 studentProgress: Array<{studentId:string;studentCode:string;studentName:string;className:string;average:number;exams:number;latestPercentage:number;timeline:Array<{examTitle:string;percentage:number;publishedAt:string|null}>}>;
 subjectTrend: Array<{examTitle:string;subjectName:string;candidates:number;average:number;correct:number;incorrect:number;blank:number}>;
};
export async function getAdvancedInstitutionReports(institutionId: string, filters: ReportFilters): Promise<AdvancedInstitutionReports> {
 if(!mongoose.isValidObjectId(institutionId)) throw new Error("INVALID_INSTITUTION");
 const tenantId=new mongoose.Types.ObjectId(institutionId);
 const latest:PipelineStage[]=[
  {$match:{institutionId:tenantId,publicationStatus:"published"}},
  {$sort:{examId:1,studentId:1,revision:-1,calculatedAt:-1,_id:-1}},
  {$group:{_id:{examId:"$examId",studentId:"$studentId"},result:{$first:"$$ROOT"}}},
  {$replaceRoot:{newRoot:"$result"}}
 ];
 const selected:Record<string,unknown>={};
 if(filters.from||filters.to) selected.publishedAt={...(filters.from?{$gte:filters.from}:{}),...(filters.to?{$lte:filters.to}:{})};
 if(filters.className) selected.className=filters.className;
 if(filters.examId) selected.examId=new mongoose.Types.ObjectId(filters.examId);
 const pipeline:PipelineStage[]=[
  ...latest,
  ...(Object.keys(selected).length?[{$match:selected} as PipelineStage]:[]),
  {$sort:{publishedAt:-1,examTitle:1,studentCode:1}},
  {$limit:5001},
  {$facet:{
   meta:[{$count:"count"}],
   overview:[{$group:{_id:null,candidateResults:{$sum:1},averagePercentage:{$avg:"$percentage"},highestPercentage:{$max:"$percentage"},lowestPercentage:{$min:"$percentage"},exams:{$addToSet:"$examId"},students:{$addToSet:"$studentId"}}}],
   examTrend:[{$group:{_id:"$examId",title:{$first:"$examTitle"},code:{$first:"$examCode"},publishedAt:{$max:"$publishedAt"},candidates:{$sum:1},average:{$avg:"$percentage"},highest:{$max:"$percentage"},lowest:{$min:"$percentage"}}},{$sort:{publishedAt:1,title:1}}],
   classPerformance:[{$group:{_id:{className:"$className",section:"$section"},candidates:{$sum:1},average:{$avg:"$percentage"},highest:{$max:"$percentage"},lowest:{$min:"$percentage"}}},{$sort:{"_id.className":1,"_id.section":1}}],
   studentProgress:[{$group:{_id:"$studentId",studentCode:{$first:"$studentCode"},studentName:{$first:"$studentName"},className:{$first:"$className"},average:{$avg:"$percentage"},exams:{$sum:1},latestPercentage:{$first:"$percentage"},timeline:{$push:{examTitle:"$examTitle",percentage:"$percentage",publishedAt:"$publishedAt"}}}},{$sort:{average:-1,studentCode:1}},{$limit:100}],
   subjectTrend:[{$unwind:"$subjects"},{$group:{_id:{examId:"$examId",examTitle:"$examTitle",subjectName:"$subjects.subjectName"},candidates:{$sum:1},average:{$avg:"$subjects.percentage"},correct:{$sum:"$subjects.correctCount"},incorrect:{$sum:"$subjects.incorrectCount"},blank:{$sum:"$subjects.blankCount"}}},{$sort:{"_id.examTitle":1,average:-1}},{$limit:500}]
  }}
 ];
 const [result]=await ExamResult.aggregate(pipeline).allowDiskUse(true).exec();
 const overview=result?.overview?.[0]??{};
 return {
  truncated:Number(result?.meta?.[0]?.count??0)>5000,
  overview:{candidateResults:Number(overview.candidateResults??0),students:Array.isArray(overview.students)?overview.students.length:0,exams:Array.isArray(overview.exams)?overview.exams.length:0,average:Number(overview.averagePercentage??0),highest:Number(overview.highestPercentage??0),lowest:Number(overview.lowestPercentage??0)},
  examTrend:(result?.examTrend??[]).map((r:Record<string,unknown>)=>({examId:String(r._id),title:String(r.title??""),code:String(r.code??""),publishedAt:r.publishedAt?new Date(String(r.publishedAt)).toISOString():null,candidates:Number(r.candidates??0),average:Number(r.average??0),highest:Number(r.highest??0),lowest:Number(r.lowest??0)})),
  classPerformance:(result?.classPerformance??[]).map((r:Record<string,unknown>)=>{const k=r._id as {className?:string;section?:string};return {className:k.className||"Unassigned",section:k.section||"",candidates:Number(r.candidates??0),average:Number(r.average??0),highest:Number(r.highest??0),lowest:Number(r.lowest??0)}}),
  studentProgress:(result?.studentProgress??[]).map((r:Record<string,unknown>)=>({studentId:String(r._id),studentCode:String(r.studentCode??""),studentName:String(r.studentName??""),className:String(r.className??""),average:Number(r.average??0),exams:Number(r.exams??0),latestPercentage:Number(r.latestPercentage??0),timeline:Array.isArray(r.timeline)?r.timeline.map((e:Record<string,unknown>)=>({examTitle:String(e.examTitle??""),percentage:Number(e.percentage??0),publishedAt:e.publishedAt?new Date(String(e.publishedAt)).toISOString():null})):[]})),
  subjectTrend:(result?.subjectTrend??[]).map((r:Record<string,unknown>)=>{const k=r._id as {examTitle?:string;subjectName?:string};return {examTitle:k.examTitle??"",subjectName:k.subjectName??"",candidates:Number(r.candidates??0),average:Number(r.average??0),correct:Number(r.correct??0),incorrect:Number(r.incorrect??0),blank:Number(r.blank??0)}})
 };
}

import mongoose, { Schema } from "mongoose";

const resultQuestionSchema = new Schema({
  questionNumber: { type: Number, required: true, min: 1, max: 300 },
  correctOption: { type: String, required: true, enum: ["A", "B", "C", "D"] },
  submittedAnswer: { type: String, required: true, enum: ["A", "B", "C", "D", "BLANK", "MULTIPLE", "UNREADABLE"] },
  outcome: { type: String, required: true, enum: ["correct", "incorrect", "blank"] },
  marksAwarded: { type: Number, required: true },
}, { _id: false });

const resultSubjectSchema = new Schema({
  subjectId: { type: Schema.Types.ObjectId, required: true },
  subjectName: { type: String, required: true, maxlength: 80 },
  questionCount: { type: Number, required: true, min: 1, max: 300 },
  correctCount: { type: Number, required: true, min: 0 },
  incorrectCount: { type: Number, required: true, min: 0 },
  blankCount: { type: Number, required: true, min: 0 },
  marksObtained: { type: Number, required: true },
  maximumMarks: { type: Number, required: true, min: 0 },
  percentage: { type: Number, required: true },
  questions: { type: [resultQuestionSchema], required: true },
}, { _id: false });

const examResultSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
  examTitle: { type: String, required: true, maxlength: 120 },
  examCode: { type: String, required: true, maxlength: 30 },
  studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  studentCode: { type: String, required: true, maxlength: 40 },
  studentName: { type: String, required: true, maxlength: 120 },
  className: { type: String, default: "", maxlength: 60 },
  section: { type: String, default: "", maxlength: 40 },
  rollNumber: { type: String, default: "", maxlength: 40 },
  subjects: { type: [resultSubjectSchema], required: true },
  totalCorrect: { type: Number, required: true, min: 0 },
  totalIncorrect: { type: Number, required: true, min: 0 },
  totalBlank: { type: Number, required: true, min: 0 },
  totalMarksObtained: { type: Number, required: true },
  totalMaximumMarks: { type: Number, required: true, min: 0 },
  percentage: { type: Number, required: true },
  sourceRecognitionIds: { type: [Schema.Types.ObjectId], required: true },
  sourceHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  revision: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["calculated"], default: "calculated", required: true },
  publicationStatus: { type: String, enum: ["draft", "published"], default: "draft", index: true },
  publishedAt: { type: Date, default: null },
  publishedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  notificationStatus: { type: String, enum: ["not_sent", "sent", "failed", "no_email", "not_configured"], default: "not_sent" },
  notificationSentAt: { type: Date, default: null },
  calculatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  calculatedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, collection: "exam_results" });

examResultSchema.index(
  { institutionId: 1, examId: 1, studentId: 1, revision: 1 },
  { unique: true },
);
examResultSchema.index({ institutionId: 1, examId: 1, calculatedAt: -1 });
examResultSchema.index({ institutionId: 1, studentId: 1, calculatedAt: -1 });
examResultSchema.index({ institutionId: 1, studentId: 1, publicationStatus: 1, calculatedAt: -1 });
examResultSchema.index({ institutionId: 1, publicationStatus: 1, examId: 1, studentId: 1, revision: -1 });
examResultSchema.index({ institutionId: 1, publicationStatus: 1, publishedAt: -1, examId: 1, studentId: 1, revision: -1 });

export const ExamResult = mongoose.models.ExamResult ?? mongoose.model("ExamResult", examResultSchema);

import mongoose, { Schema } from "mongoose";

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  emailVerified: { type: Date, default: null },
  image: { type: String, default: null },
  passwordHash: { type: String, select: false },
}, { timestamps: true, collection: "users" });

const institutionSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
  phone: { type: String, trim: true, maxlength: 30, default: "" },
  address: { type: String, trim: true, maxlength: 300, default: "" },
  website: { type: String, trim: true, maxlength: 200, default: "" },
}, { timestamps: true, collection: "institutions" });

export const institutionRoles = ["owner", "admin", "teacher", "examiner"] as const;
export type InstitutionRole = typeof institutionRoles[number];

const membershipSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, enum: institutionRoles, required: true },
}, { timestamps: true, collection: "institution_memberships" });
membershipSchema.index({ institutionId: 1, userId: 1 }, { unique: true });

const studentSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  studentCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  className: { type: String, trim: true, maxlength: 60, default: "" },
  section: { type: String, trim: true, maxlength: 40, default: "" },
  rollNumber: { type: String, trim: true, maxlength: 40, default: "" },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
  phone: { type: String, trim: true, maxlength: 30, default: "" },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
}, { timestamps: true, collection: "students" });
studentSchema.index({ institutionId: 1, studentCode: 1 }, { unique: true });
studentSchema.index({ institutionId: 1, fullName: 1 });
studentSchema.index({ institutionId: 1, className: 1, section: 1 });

const invitationSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, index: true },
  role: { type: String, enum: ["admin", "teacher", "examiner"], required: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
}, { timestamps: true, collection: "institution_invitations" });
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
invitationSchema.index({ institutionId: 1, email: 1, acceptedAt: 1 });


const answerSchema = new Schema({
  questionNumber: { type: Number, required: true, min: 1 },
  option: { type: String, required: true, enum: ["A", "B", "C", "D"] },
}, { _id: false });

const examSubjectSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  questionCount: { type: Number, required: true, min: 1, max: 300 },
  marksPerQuestion: { type: Number, required: true, min: 0.01, max: 100 },
  negativeMarksPerQuestion: { type: Number, required: true, min: 0, max: 100, default: 0 },
  answerKey: { type: [answerSchema], default: [] },
  answerKeyUpdatedAt: { type: Date, default: null },
});

const examSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  examCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
  description: { type: String, trim: true, maxlength: 500, default: "" },
  startsAt: { type: Date, default: null },
  durationMinutes: { type: Number, required: true, min: 5, max: 600 },
  status: { type: String, enum: ["draft", "scheduled", "completed"], default: "draft", index: true },
  subjects: { type: [examSubjectSchema], required: true, validate: [(value: unknown[]) => value.length > 0 && value.length <= 20, "An exam must have 1–20 subjects"] },
  sheetSettings: {
    rollDigits: { type: Number, min: 4, max: 12, default: 6 },
    questionsPerPage: { type: Number, min: 20, max: 80, default: 40 },
    includeStudentName: { type: Boolean, default: true },
    includeClass: { type: Boolean, default: true },
    instructions: { type: String, trim: true, maxlength: 300, default: "Use a dark blue or black ballpoint pen. Fill bubbles completely. Do not fold or mark this sheet." },
  },
}, { timestamps: true, collection: "exams" });
examSchema.index({ institutionId: 1, examCode: 1 }, { unique: true });
examSchema.index({ institutionId: 1, startsAt: 1 });

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
export const Institution = mongoose.models.Institution ?? mongoose.model("Institution", institutionSchema);
export const Membership = mongoose.models.Membership ?? mongoose.model("Membership", membershipSchema);
export const Student = mongoose.models.Student ?? mongoose.model("Student", studentSchema);
export const Invitation = mongoose.models.Invitation ?? mongoose.model("Invitation", invitationSchema);
export const Exam = mongoose.models.Exam ?? mongoose.model("Exam", examSchema);

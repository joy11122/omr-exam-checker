import mongoose, { Schema } from "mongoose";

const studentPortalTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  purpose: { type: String, enum: ["magic_link", "session"], required: true, index: true },
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, collection: "student_portal_tokens" });

studentPortalTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
studentPortalTokenSchema.index({ institutionId: 1, studentId: 1, purpose: 1 });

export const StudentPortalToken = mongoose.models.StudentPortalToken
  ?? mongoose.model("StudentPortalToken", studentPortalTokenSchema);

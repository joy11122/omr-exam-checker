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

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
export const Institution = mongoose.models.Institution ?? mongoose.model("Institution", institutionSchema);
export const Membership = mongoose.models.Membership ?? mongoose.model("Membership", membershipSchema);
export const Student = mongoose.models.Student ?? mongoose.model("Student", studentSchema);
export const Invitation = mongoose.models.Invitation ?? mongoose.model("Invitation", invitationSchema);

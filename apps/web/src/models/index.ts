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
}, { timestamps: true, collection: "institutions" });

export const institutionRoles = ["owner", "admin", "teacher", "examiner"] as const;
export type InstitutionRole = typeof institutionRoles[number];

const membershipSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, enum: institutionRoles, required: true },
}, { timestamps: true, collection: "institution_memberships" });
membershipSchema.index({ institutionId: 1, userId: 1 }, { unique: true });

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
export const Institution = mongoose.models.Institution ?? mongoose.model("Institution", institutionSchema);
export const Membership = mongoose.models.Membership ?? mongoose.model("Membership", membershipSchema);

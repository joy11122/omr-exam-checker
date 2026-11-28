import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema({
  institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, unique: true, index: true },
  plan: { type: String, enum: ["free", "growth", "enterprise"], default: "free", required: true },
  status: { type: String, enum: ["active", "trialing", "past_due", "cancelled", "pending_change"], default: "active", required: true, index: true },
  billingInterval: { type: String, enum: ["monthly", "yearly", "custom"], default: "monthly" },
  currency: { type: String, default: "BDT", uppercase: true, maxlength: 3 },
  amountMinor: { type: Number, min: 0, default: 0 },
  currentPeriodStart: { type: Date, default: Date.now },
  currentPeriodEnd: { type: Date, default: null },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  requestedPlan: { type: String, enum: ["free", "growth", "enterprise"], default: null },
  requestedAt: { type: Date, default: null },
  paymentProvider: { type: String, enum: ["manual", "sslcommerz", "bkash", "stripe", null], default: "manual" },
  externalCustomerId: { type: String, default: null, maxlength: 120 },
  externalSubscriptionId: { type: String, default: null, maxlength: 120 },
  lastPaymentReference: { type: String, default: null, maxlength: 120 },
  notes: { type: String, default: "", maxlength: 500 },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, collection: "subscriptions" });

subscriptionSchema.index({ institutionId: 1, status: 1 });
export const Subscription = mongoose.models.Subscription ?? mongoose.model("Subscription", subscriptionSchema);

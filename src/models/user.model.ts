import { Schema, model, type InferSchemaType } from 'mongoose';
import { DSA_TRACKS, SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from '../common/subscription.js';

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    avatar: { type: String, trim: true },
    provider: { type: String, enum: ['local', 'google'], default: 'local' },
    subscriptionPlan: { type: String, enum: SUBSCRIPTION_PLANS, default: 'basic', index: true },
    subscriptionStatus: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'active', index: true },
    subscriptionStartedAt: { type: Date, default: null },
    subscriptionEndsAt: { type: Date, default: null },
    primaryDsaTrack: { type: String, enum: DSA_TRACKS, default: null },
    featureFlags: [{ type: String, trim: true }]
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof UserSchema> & { _id: string };
export const UserModel = model('User', UserSchema);

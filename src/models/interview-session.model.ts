import { Schema, model, type InferSchemaType } from 'mongoose';
import { DSA_TRACKS, INTERVIEW_MODES } from '../common/subscription.js';

const InterviewSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    company: { type: String, required: true },
    difficulty: { type: String, required: true },
    duration: { type: Number, required: true },
    role: { type: String, default: null },
    track: { type: String, enum: DSA_TRACKS, default: null, index: true },
    mode: { type: String, enum: INTERVIEW_MODES, default: 'mixed' },
    status: {
      type: String,
      enum: ['created', 'in_progress', 'completed', 'cancelled'],
      default: 'created',
      index: true
    },
    kickoffGeneratedAt: { type: Date, default: null },
    kickoffMessageId: { type: Schema.Types.ObjectId, ref: 'InterviewMessage', default: null }
  },
  { timestamps: true }
);

InterviewSessionSchema.index({ userId: 1, createdAt: -1 });
InterviewSessionSchema.index({ userId: 1, status: 1, createdAt: -1 });

export type InterviewSessionDocument = InferSchemaType<typeof InterviewSessionSchema> & { _id: string };
export const InterviewSessionModel = model('InterviewSession', InterviewSessionSchema);

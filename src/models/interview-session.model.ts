import { Schema, model, type InferSchemaType } from 'mongoose';

const InterviewSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    company: { type: String, required: true },
    difficulty: { type: String, required: true },
    duration: { type: Number, required: true },
    role: { type: String, default: null },
    status: {
      type: String,
      enum: ['created', 'in_progress', 'completed', 'cancelled'],
      default: 'created',
      index: true
    }
  },
  { timestamps: true }
);

export type InterviewSessionDocument = InferSchemaType<typeof InterviewSessionSchema> & { _id: string };
export const InterviewSessionModel = model('InterviewSession', InterviewSessionSchema);

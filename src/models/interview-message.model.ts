import { Schema, model, type InferSchemaType } from 'mongoose';

const InterviewMessageSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'InterviewSession', required: true, index: true },
    speaker: { type: String, enum: ['ai', 'user'], required: true },
    text: { type: String, required: true }
  },
  { timestamps: true }
);

export type InterviewMessageDocument = InferSchemaType<typeof InterviewMessageSchema> & { _id: string };
export const InterviewMessageModel = model('InterviewMessage', InterviewMessageSchema);

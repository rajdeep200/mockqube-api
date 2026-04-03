import { Schema, model, type InferSchemaType } from 'mongoose';

const FeedbackReportSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'InterviewSession', required: true, unique: true },
    feedbackSummary: { type: String, required: true },
    solutionOverview: { type: String, required: true },
    recommendations: [{ type: String, required: true }],
    scores: {
      accuracy: { type: Number, required: true },
      efficiency: { type: Number, required: true },
      communication: { type: Number, required: true },
      problemSolving: { type: Number, required: true }
    }
  },
  { timestamps: true }
);

export type FeedbackReportDocument = InferSchemaType<typeof FeedbackReportSchema> & { _id: string };
export const FeedbackReportModel = model('FeedbackReport', FeedbackReportSchema);

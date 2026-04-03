import { Schema, model, type InferSchemaType } from 'mongoose';

const CodeSubmissionSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'InterviewSession', required: true, index: true },
    code: { type: String, required: true },
    language: { type: String, required: true },
    evaluation: { type: Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

export type CodeSubmissionDocument = InferSchemaType<typeof CodeSubmissionSchema> & { _id: string };
export const CodeSubmissionModel = model('CodeSubmission', CodeSubmissionSchema);

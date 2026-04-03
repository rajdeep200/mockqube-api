import { Schema, model, type InferSchemaType } from 'mongoose';

const PasswordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type PasswordResetTokenDocument = InferSchemaType<typeof PasswordResetTokenSchema> & { _id: string };
export const PasswordResetTokenModel = model('PasswordResetToken', PasswordResetTokenSchema);

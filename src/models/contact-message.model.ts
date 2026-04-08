import { Schema, model, type InferSchemaType } from 'mongoose';

const ContactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ContactMessageSchema.index({ createdAt: -1 });
ContactMessageSchema.index({ email: 1, createdAt: -1 });
ContactMessageSchema.index({ ip: 1, createdAt: -1 });

export type ContactMessageDocument = InferSchemaType<typeof ContactMessageSchema> & { _id: string };
export const ContactMessageModel = model('ContactMessage', ContactMessageSchema);

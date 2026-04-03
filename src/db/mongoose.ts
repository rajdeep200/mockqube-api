import mongoose from 'mongoose';
import { env } from '../config/env.js';

export async function connectToMongo(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: env.NODE_ENV !== 'production'
  });
}

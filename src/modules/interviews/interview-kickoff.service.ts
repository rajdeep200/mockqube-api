import { logger } from '../../common/logger.js';
import { InterviewMessageModel } from '../../models/interview-message.model.js';
import { InterviewSessionModel, type InterviewSessionDocument } from '../../models/interview-session.model.js';
import { generateInterviewerReply } from '../../services/openai/interviewer.service.js';

export const kickoffMetrics = {
  success: 0,
  failed: 0,
  duplicatesPrevented: 0,
  skippedExistingConversation: 0
};

export function shouldGenerateKickoff(prevStatus: string, nextStatus: string | undefined): boolean {
  return nextStatus === 'in_progress' && prevStatus !== 'in_progress';
}

export async function ensureKickoffMessageForSession(session: InterviewSessionDocument): Promise<void> {
  if (session.status !== 'in_progress') {
    return;
  }

  const existingKickoff = await InterviewMessageModel.findOne({ sessionId: session._id, isKickoff: true });
  if (existingKickoff) {
    return;
  }

  const existingMessage = await InterviewMessageModel.findOne({ sessionId: session._id });
  if (existingMessage) {
    kickoffMetrics.skippedExistingConversation += 1;
    return;
  }

  try {
    const aiReply = await generateInterviewerReply({
      company: session.company,
      difficulty: session.difficulty,
      duration: session.duration,
      role: session.role,
      transcript: []
    });

    const kickoffMessage = await InterviewMessageModel.create({
      sessionId: session._id,
      speaker: 'ai',
      text: `${aiReply.nextQuestion}\nHint: ${aiReply.followUpHint}`,
      isKickoff: true
    });

    await InterviewSessionModel.updateOne(
      { _id: session._id, kickoffGeneratedAt: null },
      { $set: { kickoffGeneratedAt: new Date(), kickoffMessageId: kickoffMessage._id } }
    );

    kickoffMetrics.success += 1;
    logger.info('interview_kickoff_created', {
      sessionId: String(session._id),
      messageId: String(kickoffMessage._id)
    });
  } catch (error) {
    const duplicateKeyError =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'number' &&
      (error as { code: number }).code === 11000;

    if (duplicateKeyError) {
      kickoffMetrics.duplicatesPrevented += 1;
      logger.info('interview_kickoff_duplicate_prevented', { sessionId: String(session._id) });
      return;
    }

    kickoffMetrics.failed += 1;
    logger.error('interview_kickoff_failed', {
      sessionId: String(session._id),
      reason: error instanceof Error ? error.message : 'unknown'
    });
    throw error;
  }
}

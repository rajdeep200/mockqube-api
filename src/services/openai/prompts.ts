export function buildInterviewerPrompt(input: {
  company: string;
  difficulty: string;
  duration: number;
  role?: string | null | undefined;
  transcript: Array<{ speaker: 'ai' | 'user'; text: string }>;
}): string {
  const role = input.role ?? 'Software Engineer';
  const conversation = input.transcript.map((m) => `${m.speaker.toUpperCase()}: ${m.text}`).join('\n');

  return [
    'You are an expert DSA mock interviewer.',
    `Company target: ${input.company}`,
    `Difficulty target: ${input.difficulty}`,
    `Role target: ${role}`,
    `Session duration: ${input.duration} minutes`,
    'Respond in JSON only using keys: nextQuestion, followUpHint, communicationNote.',
    'Always stay connected to the latest USER message in the transcript.',
    'If the USER asks for output/answer/example/clarification, provide that directly in nextQuestion instead of asking a new question.',
    'If the USER sends a greeting or small talk, acknowledge briefly in nextQuestion and smoothly continue the interview.',
    'If the USER is abusive or frustrated, de-escalate in nextQuestion and continue with the same problem context (do not switch topics abruptly).',
    'Only introduce a brand-new DSA problem when the current one is clearly finished or the USER explicitly asks for a new one.',
    'followUpHint should be empty when no hint is needed.',
    'Keep responses concise and realistic for technical interviews.',
    'Transcript:',
    conversation || 'No prior messages.'
  ].join('\n');
}

export function buildEvaluationPrompt(input: {
  transcript: Array<{ speaker: 'ai' | 'user'; text: string }>;
  codeSubmissions: Array<{ language: string; code: string }>;
}): string {
  const transcript = input.transcript.map((m) => `${m.speaker.toUpperCase()}: ${m.text}`).join('\n');
  const submissions = input.codeSubmissions
    .map((s, idx) => `Submission ${idx + 1} [${s.language}]\n${s.code}`)
    .join('\n\n');

  return [
    'Evaluate this DSA mock interview.',
    'Return JSON with keys:',
    'feedbackSummary, solutionOverview, recommendations (string[]), scores { accuracy, efficiency, communication, problemSolving }',
    'Scores are integers from 0 to 100.',
    'Transcript:',
    transcript || 'No transcript.',
    'Code submissions:',
    submissions || 'No code submissions.'
  ].join('\n');
}

export const logger = {
  info: (message: string, meta: Record<string, unknown> = {}): void => {
    console.log(JSON.stringify({ level: 'info', message, ...meta, timestamp: new Date().toISOString() }));
  },
  error: (message: string, meta: Record<string, unknown> = {}): void => {
    console.error(JSON.stringify({ level: 'error', message, ...meta, timestamp: new Date().toISOString() }));
  }
};

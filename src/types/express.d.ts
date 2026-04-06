import 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      name: string;
      email: string;
      avatar?: string;
      provider: 'local' | 'google';
      createdAt: string;
    }
  }
}

export {};

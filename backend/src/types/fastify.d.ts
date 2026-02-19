import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string;
      id?: string; // Legacy/Alias support
      email?: string;
      role: string;
      displayName?: string;
      iat?: number;
      exp?: number;
    };
  }
}


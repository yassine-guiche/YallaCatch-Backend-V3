import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string;
      email?: string;
      role: string;
      displayName?: string;
      iat?: number;
      exp?: number;
    };
  }
}


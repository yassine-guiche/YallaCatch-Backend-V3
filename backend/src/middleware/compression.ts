import { FastifyRequest, FastifyReply } from 'fastify';
import * as zlib from 'zlib';
import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';

/**
 * Compression options
 */
interface CompressionOptions {
  threshold?: number;
  level?: number;
  chunkSize?: number;
  windowBits?: number;
  memLevel?: number;
  strategy?: number;
  filter?: (request: FastifyRequest, reply: FastifyReply) => boolean;
}

/**
 * Default compression options
 */
const defaultOptions: CompressionOptions = {
  threshold: 1024, // Only compress responses larger than 1KB
  level: 6, // Compression level (1-9, 6 is good balance)
  chunkSize: 16 * 1024, // 16KB chunks
  windowBits: 15,
  memLevel: 8,
  strategy: zlib.constants.Z_DEFAULT_STRATEGY,
  filter: (request, reply) => {
    // Default filter - compress most content types
    return shouldCompress(request, reply);
  },
};

/**
 * MIME types that should be compressed
 */
const compressibleTypes = [
  'text/html',
  'text/css',
  'text/javascript',
  'text/plain',
  'text/xml',
  'text/csv',
  'application/javascript',
  'application/json',
  'application/xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/x-javascript',
  'application/x-font-ttf',
  'application/vnd.ms-fontobject',
  'font/opentype',
  'image/svg+xml',
  'image/x-icon',
  'application/octet-stream',
];

/**
 * Check if content should be compressed
 */
function shouldCompress(request: FastifyRequest, reply: FastifyReply): boolean {
  // Don't compress if client doesn't accept encoding
  const acceptEncoding = request.headers['accept-encoding'] as string;
  if (!acceptEncoding) {
    return false;
  }

  // Get content type
  const contentType = reply.getHeader('content-type') as string;
  if (!contentType) {
    return false;
  }

  // Check if content type is compressible
  const isCompressible = compressibleTypes.some(type =>
    contentType.toLowerCase().includes(type)
  );

  if (!isCompressible) {
    return false;
  }

  // Don't compress already compressed content
  const contentEncoding = reply.getHeader('content-encoding');
  if (contentEncoding) {
    return false;
  }

  // Don't compress small responses
  const contentLength = reply.getHeader('content-length');
  if (contentLength && parseInt(contentLength as string) < (defaultOptions.threshold || 1024)) {
    return false;
  }

  // Don't compress if cache-control says no-transform
  const cacheControl = reply.getHeader('cache-control') as string;
  if (cacheControl && cacheControl.includes('no-transform')) {
    return false;
  }

  return true;
}

/**
 * Get best compression method based on client support
 */
function getBestEncoding(acceptEncoding: string): string | null {
  const encodings = acceptEncoding.toLowerCase().split(',').map(e => e.trim());

  // Prefer brotli if available
  if (encodings.some(e => e.includes('br'))) {
    return 'br';
  }

  // Then gzip
  if (encodings.some(e => e.includes('gzip'))) {
    return 'gzip';
  }

  // Finally deflate
  if (encodings.some(e => e.includes('deflate'))) {
    return 'deflate';
  }

  return null;
}

/**
 * Create compression stream based on encoding
 */
function createCompressionStream(encoding: string, options: CompressionOptions): zlib.Gzip | zlib.Deflate | zlib.BrotliCompress {
  const zlibOptions = {
    level: options.level,
    chunkSize: options.chunkSize,
    windowBits: options.windowBits,
    memLevel: options.memLevel,
    strategy: options.strategy,
  };

  switch (encoding) {
    case 'gzip':
      return zlib.createGzip(zlibOptions);
    case 'deflate':
      return zlib.createDeflate(zlibOptions);
    case 'br':
      return zlib.createBrotliCompress({
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: options.level || 6,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: options.chunkSize || 16384,
        },
      });
    default:
      throw new Error(`Unsupported encoding: ${encoding}`);
  }
}

/**
 * Compression middleware
 */
export async function compression(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any,
  options: CompressionOptions = {}
): Promise<any> {
  const opts = { ...defaultOptions, ...options };

  // Skip compression if disabled
  if (config.COMPRESSION_ENABLED === false) {
    return payload;
  }

  // Skip if filter says no
  if (opts.filter && !opts.filter(request, reply)) {
    return payload;
  }

  // Skip if no payload or payload is not string/buffer
  if (!payload || (typeof payload !== 'string' && !Buffer.isBuffer(payload))) {
    return payload;
  }

  // Skip if payload is too small
  const payloadSize = Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload);
  if (payloadSize < (opts.threshold || 1024)) {
    return payload;
  }

  // Get client's accepted encodings
  const acceptEncoding = request.headers['accept-encoding'] as string;
  if (!acceptEncoding) {
    return payload;
  }

  // Determine best encoding
  const encoding = getBestEncoding(acceptEncoding);
  if (!encoding) {
    return payload;
  }

  try {
    // Create compression stream
    const compressionStream = createCompressionStream(encoding, opts);

    // Convert payload to buffer if needed
    const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);

    // Compress the data
    const compressed = await compressBuffer(buffer, compressionStream);

    // Set compression headers safely
    reply.header('Content-Encoding', encoding);
    reply.header('Content-Length', compressed.length);
    reply.removeHeader('content-length'); // Remove original content-length

    // Add vary header for caching
    const varyHeader = reply.getHeader('vary') as string;
    if (varyHeader) {
      if (!varyHeader.toLowerCase().includes('accept-encoding')) {
        reply.header('Vary', `${varyHeader}, Accept-Encoding`);
      }
    } else {
      reply.header('Vary', 'Accept-Encoding');
    }

    // Log compression stats
    const compressionRatio = ((buffer.length - compressed.length) / buffer.length * 100).toFixed(1);

    typedLogger.debug('Response compressed', {
      encoding,
      originalSize: buffer.length,
      compressedSize: compressed.length,
      compressionRatio: `${compressionRatio}%`,
      url: request.url,
    });

    return compressed;

  } catch (error) {
    typedLogger.error('Compression failed', {
      error: (error as any).message,
      encoding,
      payloadSize,
      url: request.url,
    });

    // Return original payload if compression fails
    return payload;
  }
}

/**
 * Compress buffer using stream
 */
function compressBuffer(buffer: Buffer, compressionStream: NodeJS.ReadWriteStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    compressionStream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    compressionStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    compressionStream.on('error', (error) => {
      reject(error);
    });

    compressionStream.write(buffer);
    compressionStream.end();
  });
}

/**
 * Create compression middleware with custom options
 */
export function createCompressionMiddleware(options: CompressionOptions = {}) {
  return async (request: FastifyRequest, reply: FastifyReply, payload: any): Promise<any> => {
    return compression(request, reply, payload, options);
  };
}

/**
 * High compression for static assets
 */
export const highCompression = createCompressionMiddleware({
  level: 9, // Maximum compression
  threshold: 512, // Compress smaller files too
  filter: (request, reply) => {
    // Only for static assets
    const url = request.url;
    return url.includes('/static/') || url.includes('/assets/') || shouldCompress(request, reply);
  },
});

/**
 * Fast compression for API responses
 */
export const fastCompression = createCompressionMiddleware({
  level: 1, // Fast compression
  threshold: 2048, // Only larger responses
  filter: (request, reply) => {
    // Only for API responses
    const url = request.url;
    return url.startsWith('/api/') && shouldCompress(request, reply);
  },
});

/**
 * Adaptive compression based on response size
 */
export const adaptiveCompression = createCompressionMiddleware({
  level: 6, // Default level
  filter: (request, reply) => {
    if (!shouldCompress(request, reply)) {
      return false;
    }

    // Adjust compression level based on response size
    const contentLength = reply.getHeader('content-length');
    if (contentLength) {
      const size = parseInt(contentLength as string);

      // Use higher compression for larger responses
      if (size > 100 * 1024) { // > 100KB
        (defaultOptions as any).level = 9;
      } else if (size > 10 * 1024) { // > 10KB
        (defaultOptions as any).level = 6;
      } else {
        (defaultOptions as any).level = 3;
      }
    }

    return true;
  },
});

/**
 * Get appropriate compression middleware based on environment
 */
export function getCompressionMiddleware(): (request: FastifyRequest, reply: FastifyReply, payload: any) => Promise<any> {
  if (config.NODE_ENV === 'production') {
    return adaptiveCompression;
  } else if (config.NODE_ENV === 'development') {
    return fastCompression;
  } else {
    return compression;
  }
}

/**
 * Pre-compression for static files
 */
export async function precompressStaticFiles(filePath: string): Promise<void> {
  // This would be used in a build step to pre-compress static files
  const fs = await import('fs');
  const path = await import('path');

  try {
    const content = await fs.promises.readFile(filePath);

    // Create gzip version
    const gzipped = await compressBuffer(content, zlib.createGzip({ level: 9 }));
    await fs.promises.writeFile(`${filePath}.gz`, gzipped);

    // Create brotli version if available
    if (zlib.createBrotliCompress) {
      const brotli = await compressBuffer(content, zlib.createBrotliCompress({
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
        },
      }));
      await fs.promises.writeFile(`${filePath}.br`, brotli);
    }

    typedLogger.info('Static file pre-compressed', {
      file: path.basename(filePath),
      originalSize: content.length,
      gzipSize: gzipped.length,
    });

  } catch (error) {
    typedLogger.error('Failed to pre-compress static file', {
      file: filePath,
      error: (error as any).message,
    });
  }
}

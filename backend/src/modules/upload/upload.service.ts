import { FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';
import { config, uploadsDir } from '@/config';
import { typedLogger } from '@/lib/typed-logger';

export type UploadType = 'avatar' | 'partner' | 'reward' | 'prize' | 'marketplace';

interface UploadResult {
    success: boolean;
    url?: string;
    filename?: string;
    error?: string;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = config.UPLOAD_MAX_SIZE || 10 * 1024 * 1024; // 10MB default

const UPLOAD_SUBDIRS: Record<UploadType, string> = {
    avatar: 'avatars',
    partner: 'partners',
    reward: 'rewards',
    prize: 'prizes',
    marketplace: 'marketplace',
};

/**
 * Ensure upload directories exist
 */
export function ensureUploadDirs(): void {
    Object.values(UPLOAD_SUBDIRS).forEach((subdir) => {
        const dirPath = path.join(uploadsDir, subdir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            typedLogger.info('Created upload directory', { path: dirPath });
        }
    });
}

/**
 * Generate a unique filename for uploaded file
 */
function generateFilename(originalFilename: string, prefix: string = ''): string {
    const ext = path.extname(originalFilename).toLowerCase() || '.jpg';
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    return `${prefix}${timestamp}_${randomId}${ext}`;
}

/**
 * Validate file type based on MIME type
 */
function validateMimeType(mimeType: string): boolean {
    return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Get the extension from MIME type
 */
function getExtensionFromMime(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
    };
    return mimeToExt[mimeType.toLowerCase()] || '.jpg';
}

/**
 * Upload a single file
 */
export async function uploadFile(
    file: MultipartFile,
    type: UploadType,
    prefix: string = ''
): Promise<UploadResult> {
    try {
        // Validate MIME type
        if (!validateMimeType(file.mimetype)) {
            return {
                success: false,
                error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
            };
        }

        // Generate unique filename
        const ext = getExtensionFromMime(file.mimetype);
        const filename = generateFilename(file.filename || `upload${ext}`, prefix);
        const subdir = UPLOAD_SUBDIRS[type];
        const relativePath = path.join(subdir, filename);
        const absolutePath = path.join(uploadsDir, relativePath);

        // Ensure directory exists
        const dirPath = path.dirname(absolutePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // Stream file to disk
        await pipeline(file.file, fs.createWriteStream(absolutePath));

        // Check file size after upload
        const stats = fs.statSync(absolutePath);
        if (stats.size > MAX_FILE_SIZE) {
            // Delete oversized file
            fs.unlinkSync(absolutePath);
            return {
                success: false,
                error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
            };
        }

        // Return the URL path for serving
        const url = `/uploads/${relativePath.replace(/\\/g, '/')}`;

        typedLogger.info('File uploaded successfully', { type, filename, size: stats.size, url });

        return {
            success: true,
            url,
            filename,
        };
    } catch (error) {
        typedLogger.error('File upload error', {
            type,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return {
            success: false,
            error: 'Failed to upload file',
        };
    }
}

/**
 * Upload file from a Fastify request
 */
export async function handleFileUpload(
    request: FastifyRequest,
    type: UploadType,
    fieldName: string = 'image'
): Promise<UploadResult> {
    try {
        const data = await request.file();

        if (!data) {
            return {
                success: false,
                error: 'No file provided',
            };
        }

        return await uploadFile(data, type);
    } catch (error) {
        typedLogger.error('Handle file upload error', {
            type,
            fieldName,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return {
            success: false,
            error: 'Failed to process upload',
        };
    }
}

/**
 * Delete a file by its URL path
 */
export function deleteFile(url: string): boolean {
    try {
        if (!url || !url.startsWith('/uploads/')) {
            return false;
        }

        const relativePath = url.replace('/uploads/', '');
        const absolutePath = path.join(uploadsDir, relativePath);

        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
            typedLogger.info('File deleted', { url });
            return true;
        }

        return false;
    } catch (error) {
        typedLogger.error('File delete error', {
            url,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
    }
}

// Initialize upload directories on module load
ensureUploadDirs();

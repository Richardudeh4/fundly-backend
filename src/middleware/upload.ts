import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { AppError } from '../utils/AppError';
import type { Request } from 'express';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: path.join(process.cwd(), 'uploads', 'avatars'),
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    // Random filename so users can't guess each other's avatar paths
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(415, 'UNSUPPORTED_MEDIA', 'Only JPEG, PNG, and WebP images are allowed') as unknown as null, false);
  }
}

export const uploadAvatar = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE_BYTES } }).single('avatar');

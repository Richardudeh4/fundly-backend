import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db';
import { AppError } from '../utils/AppError';
import { normalizePhone } from '../utils/phone';
import { generateOtp, hashOtp, sendOtpSms } from '../utils/otp';
import { issueTokens, hashToken } from '../utils/tokens';
import type { OtpRow, RefreshTokenRow, UserRow } from '../types/db';
import type {
  LoginInput,
  LoginOtpVerifyInput,
  OtpSendInput,
  OtpVerifyInput,
  RefreshInput,
  SignupInput,
  UpdateMeInput,
} from './auth.schemas';

const OTP_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

// Helper: create an OTP for a user and "send" it
async function createAndSendOtp(userId: string, phone: string): Promise<void> {
  const code = generateOtp();
  // Invalidate any older unused codes for this user
  await pool.query('UPDATE otp_codes SET used = TRUE WHERE user_id = $1 AND used = FALSE', [userId]);
  await pool.query(
    `INSERT INTO otp_codes (user_id, code_hash, expires_at)
     VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
    [userId, hashOtp(code), OTP_MINUTES],
  );
  await sendOtpSms(phone, code);
}

// Helper: verify an OTP code for a user (shared by verifyOtp + verifyLoginOtp)
async function consumeOtp(userId: string, code: string): Promise<void> {
  const otpRes = await pool.query<OtpRow>(
    `SELECT * FROM otp_codes
     WHERE user_id = $1 AND used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  const otp = otpRes.rows[0];

  if (!otp || new Date(otp.expires_at) < new Date()) {
    throw new AppError(400, 'OTP_INVALID', 'Invalid or expired code');
  }
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many attempts. Request a new code.');
  }
  if (otp.code_hash !== hashOtp(code)) {
    await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    throw new AppError(400, 'OTP_INVALID', 'Invalid or expired code');
  }

  await pool.query('UPDATE otp_codes SET used = TRUE WHERE id = $1', [otp.id]);
}

// ─── POST /v1/auth/signup ──────────────────────────────────────────────────────
export async function signup(req: Request, res: Response): Promise<void> {
  const body = req.body as SignupInput;
  const phone = normalizePhone(body.phone);
  const { email, password, firstName, lastName } = body;

  const existing = await pool.query(
    'SELECT id FROM users WHERE phone = $1 OR ($2::text IS NOT NULL AND email = $2)',
    [phone, email ?? null],
  );
  if (existing.rows.length > 0) {
    throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with these details already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query<Pick<UserRow, 'id'>>(
    `INSERT INTO users (phone, email, password_hash, first_name, last_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [phone, email ?? null, passwordHash, firstName ?? null, lastName ?? null],
  );

  await createAndSendOtp(rows[0].id, phone);

  res.status(201).json({ message: 'Account created. Enter the OTP sent to your phone.' });
}

// ─── POST /v1/auth/otp/send ────────────────────────────────────────────────────
export async function sendOtp(req: Request, res: Response): Promise<void> {
  const phone = normalizePhone((req.body as OtpSendInput).phone);
  const { rows } = await pool.query<Pick<UserRow, 'id' | 'phone_verified'>>(
    'SELECT id, phone_verified FROM users WHERE phone = $1',
    [phone],
  );

  if (rows.length > 0 && !rows[0].phone_verified) {
    await createAndSendOtp(rows[0].id, phone);
  }
  res.json({ message: 'If the number is registered, an OTP has been sent.' });
}

// ─── POST /v1/auth/otp/verify ─────────────────────────────────────────────────
export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as OtpVerifyInput;
  const phone = normalizePhone(body.phone);

  const userRes = await pool.query<Pick<UserRow, 'id'>>('SELECT id FROM users WHERE phone = $1', [phone]);
  if (userRes.rows.length === 0) {
    throw new AppError(400, 'OTP_INVALID', 'Invalid or expired code');
  }
  const userId = userRes.rows[0].id;

  await consumeOtp(userId, body.code);

  await pool.query('UPDATE users SET phone_verified = TRUE WHERE id = $1', [userId]);

  const tokens = await issueTokens(userId);
  res.json({ message: 'Phone verified', ...tokens });
}

// ─── POST /v1/auth/login ──────────────────────────────────────────────────────
// Step 1: verify password → send OTP → respond with PENDING_OTP
export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginInput;
  const phone = normalizePhone(body.phone);

  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE phone = $1', [phone]);
  const user = rows[0];

  // Same error for "no such user" and "wrong password" — prevents enumeration
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Phone number or password is incorrect');
  }
  if (!user.phone_verified) {
    throw new AppError(403, 'PHONE_NOT_VERIFIED', 'Please verify your phone number first');
  }

  // Password is correct — send a login OTP for the second factor
  await createAndSendOtp(user.id, user.phone);

  res.json({ message: 'OTP sent to your phone. Enter it to complete sign in.' });
}

// ─── POST /v1/auth/login/verify-otp ──────────────────────────────────────────
// Step 2: verify the OTP sent during login → issue tokens
export async function verifyLoginOtp(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginOtpVerifyInput;
  const phone = normalizePhone(body.phone);

  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE phone = $1', [phone]);
  const user = rows[0];
  if (!user) throw new AppError(400, 'OTP_INVALID', 'Invalid or expired code');

  await consumeOtp(user.id, body.code);

  const tokens = await issueTokens(user.id);
  res.json({
    ...tokens,
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      profileImage: user.profile_image,
      identityStatus: user.identity_status,
    },
  });
}

// ─── POST /v1/auth/refresh ────────────────────────────────────────────────────
export async function refresh(req: Request, res: Response): Promise<void> {
  const tokenHash = hashToken((req.body as RefreshInput).refreshToken);

  const { rows } = await pool.query<RefreshTokenRow>(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  const stored = rows[0];

  if (!stored) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Please log in again');

  if (stored.revoked) {
    // Reuse of a revoked token is a theft signal — kill all sessions
    await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [stored.user_id]);
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Please log in again');
  }

  if (new Date(stored.expires_at) < new Date()) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Please log in again');
  }

  await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [stored.id]);
  const tokens = await issueTokens(stored.user_id);
  res.json(tokens);
}

// ─── POST /v1/auth/logout ─────────────────────────────────────────────────────
export async function logout(req: Request, res: Response): Promise<void> {
  await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [
    hashToken((req.body as RefreshInput).refreshToken),
  ]);
  res.json({ message: 'Logged out' });
}

// ─── POST /v1/me/avatar ───────────────────────────────────────────────────────
export async function uploadAvatar(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new AppError(400, 'NO_FILE', 'No image file provided');
  }

  // Build a publicly accessible URL for the saved file
  // In production swap this for a CDN/cloud storage URL
  const protocol = req.protocol;
  const host = req.get('host') ?? 'localhost:3000';
  const avatarUrl = `${protocol}://${host}/uploads/avatars/${req.file.filename}`;

  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET profile_image = $1 WHERE id = $2
     RETURNING id, phone, email, first_name, last_name, profile_image,
               phone_verified, identity_status, created_at`,
    [avatarUrl, req.userId],
  );

  const u = rows[0];
  res.json({
    id: u.id,
    phone: u.phone,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    profileImage: u.profile_image,
    phoneVerified: u.phone_verified,
    identityStatus: u.identity_status,
    createdAt: u.created_at,
  });
}

// ─── PATCH /v1/me ─────────────────────────────────────────────────────────────
export async function updateMe(req: Request, res: Response): Promise<void> {
  const { firstName, lastName, email, profileImage } = req.body as UpdateMeInput;
  const userId = req.userId!;

  // If email is being changed, make sure it isn't taken by another account
  if (email) {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email, userId],
    );
    if (rows.length > 0) {
      throw new AppError(409, 'EMAIL_TAKEN', 'That email is already in use');
    }
  }

  // Build SET clause dynamically — only update fields that were provided
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (firstName !== undefined) { updates.push(`first_name = $${idx++}`);   values.push(firstName); }
  if (lastName  !== undefined) { updates.push(`last_name = $${idx++}`);    values.push(lastName); }
  if (email     !== undefined) { updates.push(`email = $${idx++}`);        values.push(email); }
  if (profileImage !== undefined) { updates.push(`profile_image = $${idx++}`); values.push(profileImage); }

  if (updates.length === 0) {
    throw new AppError(400, 'NO_CHANGES', 'No fields provided to update');
  }

  values.push(userId);
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );

  const u = rows[0];
  res.json({
    id: u.id,
    phone: u.phone,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    profileImage: u.profile_image,
    phoneVerified: u.phone_verified,
    identityStatus: u.identity_status,
    createdAt: u.created_at,
  });
}

// ─── GET /v1/me ───────────────────────────────────────────────────────────────
export async function getMe(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query<UserRow>(
    `SELECT id, phone, email, first_name, last_name, profile_image,
            phone_verified, identity_status, created_at
     FROM users WHERE id = $1`,
    [req.userId],
  );
  if (rows.length === 0) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  const u = rows[0];
  res.json({
    id: u.id,
    phone: u.phone,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    profileImage: u.profile_image,
    phoneVerified: u.phone_verified,
    identityStatus: u.identity_status,
    createdAt: u.created_at,
  });
}

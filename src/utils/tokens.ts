import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../db';
import { config } from '../config';

export type Tokens = {
  accessToken: string;
  refreshToken: string;
};

function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('hex');

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + make_interval(days => $3))`,
    [userId, hashToken(token), config.REFRESH_TOKEN_DAYS]
  );
  return token;
}

export async function issueTokens(userId: string): Promise<Tokens> {
  return {
    accessToken: signAccessToken(userId),
    refreshToken: await issueRefreshToken(userId),
  };
}
import crypto from 'crypto';
import { config } from '../config';

export function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtp(code: string): string {
  return crypto.createHmac('sha256', config.OTP_SECRET).update(code).digest('hex');
}

// Replace this with a real SMS provider later (e.g. Termii, Twilio).
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  if (config.NODE_ENV !== 'production') {
    console.log(`[DEV ONLY] OTP for ${phone}: ${code}`);
  }
  // TODO: call your SMS provider here
}
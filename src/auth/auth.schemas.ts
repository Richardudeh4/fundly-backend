import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .regex(/^(\+234|234|0)[789][01]\d{8}$/, 'Enter a valid Nigerian phone number');

export const signupSchema = z.object({
  phone,
  email: z.string().trim().toLowerCase().email().optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Za-z]/, 'Password needs a letter')
    .regex(/\d/, 'Password needs a number'),
  firstName: z.string().trim().min(1, 'First name is required').max(100).optional(),
  lastName: z.string().trim().min(1, 'Last name is required').max(100).optional(),
});

export const otpSendSchema = z.object({ phone });

export const otpVerifySchema = z.object({
  phone,
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const loginSchema = z.object({
  phone,
  password: z.string().min(1),
});

// Second step of the login flow: verify the OTP that was sent after password check
export const loginOtpVerifySchema = z.object({
  phone,
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export const updateMeSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  profileImage: z.string().url('Must be a valid URL').max(2048).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type OtpSendInput = z.infer<typeof otpSendSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LoginOtpVerifyInput = z.infer<typeof loginOtpVerifySchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

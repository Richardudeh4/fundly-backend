import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/requireAuth';
import { uploadAvatar } from '../middleware/upload';
import { asyncHandler } from '../utils/asyncHandler';
import * as c from './auth.controller';
import * as s from './auth.schemas';

const router = Router();

const limiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later', details: {} },
    },
  });

router.post('/auth/signup', limiter(10), validate(s.signupSchema), asyncHandler(c.signup));
router.post('/auth/otp/send', limiter(5), validate(s.otpSendSchema), asyncHandler(c.sendOtp));
router.post('/auth/otp/verify', limiter(10), validate(s.otpVerifySchema), asyncHandler(c.verifyOtp));
router.post('/auth/login', limiter(10), validate(s.loginSchema), asyncHandler(c.login));
router.post('/auth/login/verify-otp', limiter(10), validate(s.loginOtpVerifySchema), asyncHandler(c.verifyLoginOtp));
router.post('/auth/refresh', limiter(30), validate(s.refreshSchema), asyncHandler(c.refresh));
router.post('/auth/logout', validate(s.refreshSchema), asyncHandler(c.logout));

router.get('/me', requireAuth, asyncHandler(c.getMe));
router.patch('/me', requireAuth, validate(s.updateMeSchema), asyncHandler(c.updateMe));
router.post('/me/avatar', requireAuth, uploadAvatar, asyncHandler(c.uploadAvatar));

export default router;
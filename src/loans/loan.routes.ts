import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import * as c from './loan.controller';
import * as s from './loan.schemas';

const router = Router();

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many loan applications, try again later', details: {} },
  },
});

// ── Public — no token required ─────────────────────────────────────────────────
// Must be registered BEFORE router.use(requireAuth) and BEFORE /:loanId
// so Express doesn't mistake "calculate" for a UUID param.
router.get('/loans/calculate', validate(s.calculateLoanSchema), asyncHandler(c.calculateLoan));

// ── All routes below require a valid access token ──────────────────────────────
router.use(requireAuth);

router.post('/loans', applyLimiter, validate(s.applyLoanSchema), asyncHandler(c.applyLoan));
router.get('/loans', asyncHandler(c.listLoans));
router.get('/loans/:loanId', asyncHandler(c.getLoan));
router.get('/loans/:loanId/detail', asyncHandler(c.getLoanDetail));
router.get('/loans/:loanId/schedule', asyncHandler(c.getLoanSchedule));
router.post('/loans/:loanId/repay', validate(s.repayLoanSchema), asyncHandler(c.repayLoan));
router.get('/loans/:loanId/repayments', asyncHandler(c.listRepayments));
router.get('/repayments', asyncHandler(c.listAllRepayments));

export default router;

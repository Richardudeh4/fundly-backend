import { z } from 'zod';

// POST /v1/loans  — apply for a loan
export const applyLoanSchema = z.object({
  body: z.object({
    /** Amount in kobo, e.g. 500_000_00 = ₦500,000 */
    amountKobo: z
      .number({ required_error: 'Amount is required' })
      .int('Amount must be an integer in kobo')
      .min(10_000_00, 'Minimum loan is ₦10,000')
      .max(5_000_000_00, 'Maximum loan is ₦5,000,000'),
    termMonths: z
      .number({ required_error: 'Term is required' })
      .int()
      .min(1, 'Minimum term is 1 month')
      .max(60, 'Maximum term is 60 months'),
    purpose: z.string().max(100).optional(),
  }),
});

// POST /v1/loans/:loanId/repay
export const repayLoanSchema = z.object({
  params: z.object({
    loanId: z.string().uuid('Invalid loan ID'),
  }),
  body: z.object({
    amountKobo: z
      .number({ required_error: 'Amount is required' })
      .int('Amount must be an integer in kobo')
      .min(1, 'Amount must be positive'),
    /** Idempotency key — caller generates a UUID per payment attempt */
    reference: z.string().min(1).max(100),
  }),
});

export type ApplyLoanInput = z.infer<typeof applyLoanSchema>['body'];
export type RepayLoanInput = z.infer<typeof repayLoanSchema>['body'];

// GET /v1/loans/calculate?amountKobo=&termMonths=
export const calculateLoanSchema = z.object({
  query: z.object({
    amountKobo: z.coerce
      .number({ required_error: 'amountKobo is required' })
      .int('Must be an integer in kobo')
      .min(10_000_00, 'Minimum loan is ₦10,000')
      .max(5_000_000_00, 'Maximum loan is ₦5,000,000'),
    termMonths: z.coerce
      .number({ required_error: 'termMonths is required' })
      .int()
      .min(1, 'Minimum term is 1 month')
      .max(60, 'Maximum term is 60 months'),
  }),
});

export type CalculateLoanInput = z.infer<typeof calculateLoanSchema>['query'];

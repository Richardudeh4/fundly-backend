import { Request, Response } from 'express';
import { pool } from '../db';
import { AppError } from '../utils/AppError';
import type { ApplyLoanInput, RepayLoanInput, CalculateLoanInput } from './loan.schemas';

/** Annual interest rate applied to all loans (15 %) */
const ANNUAL_RATE = 0.15;


function calcInstalment(principalKobo: number, termMonths: number): number {
  const r = ANNUAL_RATE / 12;
  const factor = Math.pow(1 + r, termMonths);
  return Math.round((principalKobo * r * factor) / (factor - 1));
}

// ─── GET /v1/loans/calculate ──────────────────────────────────────────────────
// Pure computation — no auth, no DB. Returns a full repayment breakdown.
export async function calculateLoan(req: Request, res: Response): Promise<void> {
  const { amountKobo, termMonths } = req.query as unknown as CalculateLoanInput;

  const monthlyInstalmentKobo = calcInstalment(amountKobo, termMonths);
  const totalRepaymentKobo    = monthlyInstalmentKobo * termMonths;
  const totalInterestKobo     = totalRepaymentKobo - amountKobo;

  // Build a full amortisation table so the client can show it row-by-row
  const schedule: Array<{
    month: number;
    principalKobo: number;
    interestKobo: number;
    instalmentKobo: number;
    remainingBalanceKobo: number;
  }> = [];

  const r = ANNUAL_RATE / 12;
  let balance = amountKobo;

  for (let n = 1; n <= termMonths; n++) {
    const interestKobo   = Math.round(balance * r);
    const principalKobo  = n === termMonths ? balance : monthlyInstalmentKobo - interestKobo;
    balance             -= principalKobo;

    schedule.push({
      month:                n,
      principalKobo,
      interestKobo,
      instalmentKobo:       principalKobo + interestKobo,
      remainingBalanceKobo: Math.max(0, balance),
    });
  }

  res.json({
    amountKobo,
    termMonths,
    annualInterestRate:     `${(ANNUAL_RATE * 100).toFixed(2)}%`,
    monthlyInstalmentKobo,
    totalRepaymentKobo,
    totalInterestKobo,
    schedule,
  });
}

// ─── POST /v1/loans ────────────────────────────────────────────────────────────
export async function applyLoan(req: Request, res: Response): Promise<void> {
  const { amountKobo, termMonths, purpose } = req.body as ApplyLoanInput;
  const userId = req.userId!;

  const { rows: active } = await pool.query(
    `SELECT id FROM loans WHERE user_id = $1 AND status IN ('PENDING','ACTIVE')`,
    [userId],
  );
  if (active.length > 0) {
    throw new AppError(409, 'LOAN_EXISTS', 'You already have an active or pending loan');
  }

  const monthlyInstalmentKobo = calcInstalment(amountKobo, termMonths);
  const totalOwedKobo = monthlyInstalmentKobo * termMonths;
  const disbursedAt = new Date(Date.now() + 2 * 60 * 1000);
  const dueAt = new Date(disbursedAt);
  dueAt.setMonth(dueAt.getMonth() + termMonths);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO loans
         (user_id, principal_kobo, interest_rate, term_months,
          monthly_instalment_kobo, total_owed_kobo, balance_kobo, purpose,
          status, disbursed_at, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$10)
       RETURNING *`,
      [
        userId, amountKobo, (ANNUAL_RATE * 100).toFixed(2), termMonths,
        monthlyInstalmentKobo, totalOwedKobo, totalOwedKobo,
        purpose ?? null, disbursedAt, dueAt,
      ],
    );
    const loan = rows[0];

    // ── Generate instalment schedule ──────────────────────────────────────
    // Split each monthly payment into principal + interest using an
    // amortisation schedule so the numbers add up exactly.
    let remainingBalance = amountKobo;
    const r = ANNUAL_RATE / 12;
    const instalmentValues: unknown[] = [];
    const instalmentPlaceholders: string[] = [];
    let pIdx = 1;

    for (let n = 1; n <= termMonths; n++) {
      const dueDate = new Date(disbursedAt);
      dueDate.setMonth(dueDate.getMonth() + n);

      const interestKobo = Math.round(remainingBalance * r);
      const principalKobo =
        n === termMonths
          ? remainingBalance                          // last instalment clears the balance
          : monthlyInstalmentKobo - interestKobo;
      const totalDueKobo = principalKobo + interestKobo;

      remainingBalance -= principalKobo;

      instalmentPlaceholders.push(
        `($${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++},$${pIdx++})`,
      );
      instalmentValues.push(
        loan.id, userId, n, dueDate, principalKobo, interestKobo, totalDueKobo,
      );
    }

    await client.query(
      `INSERT INTO loan_instalments
         (loan_id, user_id, instalment_number, due_date,
          principal_kobo, interest_kobo, total_due_kobo)
       VALUES ${instalmentPlaceholders.join(',')}`,
      instalmentValues,
    );

    await client.query('COMMIT');
    res.status(201).json(await formatLoanWithNextDue(loan));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── GET /v1/loans ─────────────────────────────────────────────────────────────
export async function listLoans(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM loans WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.userId],
  );
  const formatted = await Promise.all(rows.map(formatLoanWithNextDue));
  res.json(formatted);
}

// ─── GET /v1/loans/:loanId/detail ─────────────────────────────────────────────
// Returns loan + full instalment schedule + repayment history in one call.
// This is what the loan detail screen uses so it only needs one request.
export async function getLoanDetail(req: Request, res: Response): Promise<void> {
  const { loanId } = req.params;

  // All three queries run in parallel
  const [loanResult, scheduleResult, repaymentsResult] = await Promise.all([
    pool.query(`SELECT * FROM loans WHERE id = $1 AND user_id = $2`, [loanId, req.userId]),
    pool.query(
      `SELECT * FROM loan_instalments WHERE loan_id = $1 ORDER BY instalment_number`,
      [loanId],
    ),
    pool.query(
      `SELECT * FROM repayments WHERE loan_id = $1 ORDER BY created_at DESC`,
      [loanId],
    ),
  ]);

  if (loanResult.rows.length === 0) throw new AppError(404, 'NOT_FOUND', 'Loan not found');

  const loan      = loanResult.rows[0];
  const schedule  = scheduleResult.rows.map(formatInstalment);
  const repayments = repaymentsResult.rows.map(formatRepayment);

  // Compute summary stats
  const paidCount        = schedule.filter((i) => i.status === 'PAID').length;
  const overdueCount     = schedule.filter((i) => i.status === 'OVERDUE' || i.status === 'ROLLED_OVER').length;
  const totalPaidKobo    = repayments
    .filter((r) => r.status === 'SUCCESS')
    .reduce((sum, r) => sum + (r.amountKobo as number), 0);
  const nextDueInstalment = schedule.find(
    (i) => i.status === 'PENDING' || i.status === 'PARTIAL' || i.status === 'OVERDUE',
  ) ?? null;

  res.json({
    loan: await formatLoanWithNextDue(loan),
    schedule,
    repayments,
    stats: {
      paidCount,
      totalCount:     schedule.length,
      overdueCount,
      totalPaidKobo,
      progressPct:    schedule.length > 0 ? Math.round((paidCount / schedule.length) * 100) : 0,
      nextDue: nextDueInstalment
        ? {
            instalmentNumber: nextDueInstalment.instalmentNumber,
            dueDate:          nextDueInstalment.dueDate,
            outstandingKobo:  nextDueInstalment.outstandingKobo,
          }
        : null,
    },
  });
}

// ─── GET /v1/loans/:loanId ─────────────────────────────────────────────────────
export async function getLoan(req: Request, res: Response): Promise<void> {
  const { loanId } = req.params;
  const { rows } = await pool.query(
    `SELECT * FROM loans WHERE id = $1 AND user_id = $2`,
    [loanId, req.userId],
  );
  if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', 'Loan not found');
  res.json(await formatLoanWithNextDue(rows[0]));
}

// ─── GET /v1/loans/:loanId/schedule ───────────────────────────────────────────
export async function getLoanSchedule(req: Request, res: Response): Promise<void> {
  const { loanId } = req.params;

  // Verify ownership
  const { rows: loanCheck } = await pool.query(
    `SELECT id FROM loans WHERE id = $1 AND user_id = $2`,
    [loanId, req.userId],
  );
  if (loanCheck.length === 0) throw new AppError(404, 'NOT_FOUND', 'Loan not found');

  const { rows } = await pool.query(
    `SELECT * FROM loan_instalments
     WHERE loan_id = $1
     ORDER BY instalment_number`,
    [loanId],
  );

  res.json(rows.map(formatInstalment));
}

// ─── POST /v1/loans/:loanId/repay ─────────────────────────────────────────────
// Supports part payment — applies to the earliest unpaid instalment first,
// cascades excess to subsequent instalments.
export async function repayLoan(req: Request, res: Response): Promise<void> {
  const { loanId } = req.params;
  const { amountKobo, reference } = req.body as RepayLoanInput;
  const userId = req.userId!;

  const { rows: loanRows } = await pool.query(
    `SELECT * FROM loans WHERE id = $1 AND user_id = $2`,
    [loanId, userId],
  );
  const loan = loanRows[0];
  if (!loan) throw new AppError(404, 'NOT_FOUND', 'Loan not found');
  if (loan.status !== 'ACTIVE')
    throw new AppError(400, 'LOAN_NOT_ACTIVE', 'Loan is not active');
  if (amountKobo < 100)
    throw new AppError(400, 'AMOUNT_TOO_SMALL', 'Minimum payment is ₦1');
  if (amountKobo > loan.balance_kobo)
    throw new AppError(400, 'OVERPAYMENT', 'Amount exceeds outstanding balance');

  const { rows: dup } = await pool.query(
    `SELECT id FROM repayments WHERE reference = $1`,
    [reference],
  );
  if (dup.length > 0) throw new AppError(409, 'DUPLICATE_REFERENCE', 'Duplicate payment reference');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Record the raw repayment transaction
    const { rows: repayRows } = await client.query(
      `INSERT INTO repayments (loan_id, user_id, amount_kobo, reference, status, paid_at)
       VALUES ($1,$2,$3,$4,'SUCCESS', NOW())
       RETURNING *`,
      [loanId, userId, amountKobo, reference],
    );

    // Apply payment to instalments, earliest-first, cascading any excess
    let remaining = amountKobo;

    const { rows: unpaidInstalments } = await client.query(
      `SELECT * FROM loan_instalments
       WHERE loan_id = $1 AND status IN ('PENDING','PARTIAL','OVERDUE')
       ORDER BY instalment_number`,
      [loanId],
    );

    for (const inst of unpaidInstalments) {
      if (remaining <= 0) break;

      const outstanding =
        inst.total_due_kobo + inst.overdue_charge_kobo - inst.amount_paid_kobo;
      const applying = Math.min(remaining, outstanding);
      const newAmountPaid = inst.amount_paid_kobo + applying;
      remaining -= applying;

      const fullyPaid = newAmountPaid >= inst.total_due_kobo + inst.overdue_charge_kobo;
      const newStatus = fullyPaid ? 'PAID' : 'PARTIAL';

      await client.query(
        `UPDATE loan_instalments
         SET amount_paid_kobo = $1,
             status = $2,
             paid_at = $3
         WHERE id = $4`,
        [newAmountPaid, newStatus, fullyPaid ? new Date() : null, inst.id],
      );
    }

    // Update loan balance and status
    const newBalance = loan.balance_kobo - amountKobo;
    const allPaid = newBalance <= 0;
    await client.query(
      `UPDATE loans SET balance_kobo = $1, status = $2 WHERE id = $3`,
      [Math.max(0, newBalance), allPaid ? 'PAID' : 'ACTIVE', loanId],
    );

    await client.query('COMMIT');
    res.status(201).json(formatRepayment(repayRows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── GET /v1/loans/:loanId/repayments ─────────────────────────────────────────
export async function listRepayments(req: Request, res: Response): Promise<void> {
  const { loanId } = req.params;
  const { rows: loanCheck } = await pool.query(
    `SELECT id FROM loans WHERE id = $1 AND user_id = $2`,
    [loanId, req.userId],
  );
  if (loanCheck.length === 0) throw new AppError(404, 'NOT_FOUND', 'Loan not found');

  const { rows } = await pool.query(
    `SELECT * FROM repayments WHERE loan_id = $1 ORDER BY created_at DESC`,
    [loanId],
  );
  res.json(rows.map(formatRepayment));
}

// ─── GET /v1/repayments ────────────────────────────────────────────────────────
export async function listAllRepayments(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT r.* FROM repayments r
     JOIN loans l ON l.id = r.loan_id
     WHERE l.user_id = $1
     ORDER BY r.created_at DESC`,
    [req.userId],
  );
  res.json(rows.map(formatRepayment));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch the next unpaid instalment for a loan and attach it to the loan shape */
async function formatLoanWithNextDue(row: Record<string, unknown>) {
  const { rows: nextRows } = await pool.query(
    `SELECT instalment_number, due_date, total_due_kobo, overdue_charge_kobo, amount_paid_kobo
     FROM loan_instalments
     WHERE loan_id = $1 AND status IN ('PENDING','PARTIAL','OVERDUE')
     ORDER BY instalment_number
     LIMIT 1`,
    [row.id],
  );

  const next = nextRows[0];
  const nextDue = next
    ? {
        instalmentNumber: next.instalment_number,
        dueDate: next.due_date,
        outstandingKobo:
          next.total_due_kobo + next.overdue_charge_kobo - next.amount_paid_kobo,
      }
    : null;

  return {
    id: row.id,
    principalKobo: row.principal_kobo,
    interestRate: row.interest_rate,
    termMonths: row.term_months,
    monthlyInstalmentKobo: row.monthly_instalment_kobo,
    totalOwedKobo: row.total_owed_kobo,
    balanceKobo: row.balance_kobo,
    status: row.status,
    purpose: row.purpose,
    disbursedAt: row.disbursed_at,
    dueAt: row.due_at,
    createdAt: row.created_at,
    nextDue,
  };
}

function formatInstalment(row: Record<string, unknown>) {
  const totalDue = (row.total_due_kobo as number);
  const overdueCharge = (row.overdue_charge_kobo as number);
  const amountPaid = (row.amount_paid_kobo as number);
  return {
    id: row.id,
    instalmentNumber: row.instalment_number,
    dueDate: row.due_date,
    principalKobo: row.principal_kobo,
    interestKobo: row.interest_kobo,
    totalDueKobo: totalDue,
    overdueChargeKobo: overdueCharge,
    amountPaidKobo: amountPaid,
    outstandingKobo: Math.max(0, totalDue + overdueCharge - amountPaid),
    status: row.status,
    paidAt: row.paid_at,
  };
}

function formatRepayment(row: Record<string, unknown>) {
  return {
    id: row.id,
    loanId: row.loan_id,
    amountKobo: row.amount_kobo,
    reference: row.reference,
    status: row.status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

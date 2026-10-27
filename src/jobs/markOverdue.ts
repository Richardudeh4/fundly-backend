import { pool } from '../db';


const OVERDUE_PENALTY_RATE = 0.05; // 5 %

type InstalmentRow = {
  id: string;
  loan_id: string;
  instalment_number: number;
  total_due_kobo: number;
  overdue_charge_kobo: number;
  amount_paid_kobo: number;
};

/**
 * Runs periodically to:
 * 1. Mark PENDING/PARTIAL instalments whose due_date has passed as OVERDUE
 * 2. Calculate a 5% penalty on the missed outstanding amount
 * 3. Roll the penalty + outstanding balance into the next unpaid instalment
 * 4. Mark the original instalment as ROLLED_OVER
 *
 * Each execution is wrapped in a single transaction so partial failures don't
 * leave the data in an inconsistent state.
 */
export async function markOverdueInstalments(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find all instalments that are past due and still unpaid/partial
    const { rows: overdueRows } = await client.query<InstalmentRow>(
      `SELECT id, loan_id, instalment_number, total_due_kobo,
              overdue_charge_kobo, amount_paid_kobo
       FROM loan_instalments
       WHERE due_date < NOW()
         AND status IN ('PENDING', 'PARTIAL')
       ORDER BY loan_id, instalment_number`,
    );

    for (const inst of overdueRows) {
      // Outstanding amount on this instalment
      const outstanding =
        inst.total_due_kobo + inst.overdue_charge_kobo - inst.amount_paid_kobo;
      const penalty = Math.round(outstanding * OVERDUE_PENALTY_RATE);

      // Find the next unpaid instalment for this loan
      const { rows: nextRows } = await client.query<{ id: string; total_due_kobo: number; overdue_charge_kobo: number }>(
        `SELECT id, total_due_kobo, overdue_charge_kobo
         FROM loan_instalments
         WHERE loan_id = $1
           AND instalment_number > $2
           AND status IN ('PENDING', 'PARTIAL')
         ORDER BY instalment_number
         LIMIT 1`,
        [inst.loan_id, inst.instalment_number],
      );

      // Mark the overdue instalment as ROLLED_OVER
      await client.query(
        `UPDATE loan_instalments
         SET status = 'ROLLED_OVER'
         WHERE id = $1`,
        [inst.id],
      );

      if (nextRows.length > 0) {
        const next = nextRows[0];
        const newOverdueCharge = next.overdue_charge_kobo + outstanding + penalty;
        await client.query(
          `UPDATE loan_instalments
           SET overdue_charge_kobo = $1
           WHERE id = $2`,
          [newOverdueCharge, next.id],
        );
      }
      // If there's no next instalment, the entire loan balance already captures
      // this through loans.balance_kobo — no further action needed here.
    }

    await client.query('COMMIT');

    if (overdueRows.length > 0) {
      console.log(`[markOverdue] Processed ${overdueRows.length} overdue instalment(s)`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[markOverdue] Failed:', err);
  } finally {
    client.release();
  }
}

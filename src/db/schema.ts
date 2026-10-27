import { pgTable, uuid, varchar, text, boolean, timestamp, integer, numeric } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash').notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  profileImage: text('profile_image'),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  identityStatus: varchar('identity_status', {
    length: 20,
    enum: ['NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED'],
  })
    .notNull()
    .default('NOT_STARTED'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Types generated from the tables (replaces src/types/db.ts)
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ─── Loans ────────────────────────────────────────────────────────────────────
export const loans = pgTable('loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Disbursed principal in kobo (integer avoids float rounding) */
  principalKobo: integer('principal_kobo').notNull(),
  /** Annual interest rate, e.g. "15.00" = 15% */
  interestRate: numeric('interest_rate', { precision: 5, scale: 2 }).notNull(),
  /** Loan term in months */
  termMonths: integer('term_months').notNull(),
  /** Monthly instalment in kobo */
  monthlyInstalmentKobo: integer('monthly_instalment_kobo').notNull(),
  /** Total amount owed (principal + interest) in kobo */
  totalOwedKobo: integer('total_owed_kobo').notNull(),
  /** Running balance (what's left to pay) in kobo */
  balanceKobo: integer('balance_kobo').notNull(),
  status: varchar('status', {
    length: 20,
    enum: ['PENDING', 'ACTIVE', 'PAID', 'DEFAULTED', 'REJECTED'],
  })
    .notNull()
    .default('PENDING'),
  purpose: varchar('purpose', { length: 100 }),
  disbursedAt: timestamp('disbursed_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const repayments = pgTable('repayments', {
  id: uuid('id').primaryKey().defaultRandom(),
  loanId: uuid('loan_id')
    .notNull()
    .references(() => loans.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  amountKobo: integer('amount_kobo').notNull(),
  reference: varchar('reference', { length: 100 }).notNull().unique(),
  status: varchar('status', {
    length: 20,
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
  })
    .notNull()
    .default('PENDING'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Loan = typeof loans.$inferSelect;
export type NewLoan = typeof loans.$inferInsert;
export type Repayment = typeof repayments.$inferSelect;
export type NewRepayment = typeof repayments.$inferInsert;

// ─── Loan Instalments ─────────────────────────────────────────────────────────
export const loanInstalments = pgTable('loan_instalments', {
  id: uuid('id').primaryKey().defaultRandom(),
  loanId: uuid('loan_id')
    .notNull()
    .references(() => loans.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 1-based index, e.g. instalment 3 of 12 */
  instalmentNumber: integer('instalment_number').notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  /** Principal portion of this instalment in kobo */
  principalKobo: integer('principal_kobo').notNull(),
  /** Interest portion of this instalment in kobo */
  interestKobo: integer('interest_kobo').notNull(),
  /** principalKobo + interestKobo — the base amount before any overdue charge */
  totalDueKobo: integer('total_due_kobo').notNull(),
  /** Penalty accrued from rolled-over missed instalments */
  overdueChargeKobo: integer('overdue_charge_kobo').notNull().default(0),
  /** How much has been paid so far (supports partial payments) */
  amountPaidKobo: integer('amount_paid_kobo').notNull().default(0),
  status: varchar('status', {
    length: 20,
    enum: ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'ROLLED_OVER'],
  })
    .notNull()
    .default('PENDING'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LoanInstalment = typeof loanInstalments.$inferSelect;
export type NewLoanInstalment = typeof loanInstalments.$inferInsert;

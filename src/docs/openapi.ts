// ── Helpers ───────────────────────────────────────────────────────────────────
const err = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const json = (schema: object) => ({
  content: { 'application/json': { schema } },
});

const bearer = [{ bearerAuth: [] }];

// ── Reusable inline schemas ───────────────────────────────────────────────────
const uuidParam = (name: string, description: string) => ({
  name,
  in: 'path' as const,
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
});

// ─────────────────────────────────────────────────────────────────────────────
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Fundly API',
    version: '2.0.0',
    description:
      'Full API for the Fundly B2C loan app — authentication, user profile, ' +
      'loan application, instalment schedule, repayments, and the loan calculator.',
  },
  servers: [{ url: '/v1', description: 'Current server' }],
  tags: [
    { name: 'Auth',       description: 'Sign up, OTP, login (2-step) and token management' },
    { name: 'User',       description: 'Profile and avatar' },
    { name: 'Loans',      description: 'Apply, view and manage loans' },
    { name: 'Schedule',   description: 'Monthly instalment schedule per loan' },
    { name: 'Repayments', description: 'Make and list repayments' },
    { name: 'Calculator', description: 'Public loan repayment calculator (no auth)' },
  ],

  // ── Reusable components ────────────────────────────────────────────────────
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      // ── Generic ──────────────────────────────────────────────────────────
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code:    { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Invalid input' },
              details: { type: 'object' },
            },
          },
        },
      },
      Message: {
        type: 'object',
        properties: { message: { type: 'string', example: 'OK' } },
      },
      Tokens: {
        type: 'object',
        properties: {
          accessToken:  { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },

      // ── Users ─────────────────────────────────────────────────────────────
      UserProfile: {
        type: 'object',
        properties: {
          id:             { type: 'string', format: 'uuid' },
          phone:          { type: 'string', example: '+2348011111111' },
          email:          { type: 'string', nullable: true, example: 'ada@example.com' },
          firstName:      { type: 'string', nullable: true, example: 'Ada' },
          lastName:       { type: 'string', nullable: true, example: 'Lovelace' },
          profileImage:   { type: 'string', nullable: true, format: 'uri', example: 'https://api.example.com/uploads/avatars/uuid.jpg' },
          phoneVerified:  { type: 'boolean' },
          identityStatus: { type: 'string', enum: ['NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED'] },
          createdAt:      { type: 'string', format: 'date-time' },
        },
      },

      // ── Loans ─────────────────────────────────────────────────────────────
      NextDue: {
        type: 'object',
        nullable: true,
        properties: {
          instalmentNumber: { type: 'integer', example: 3 },
          dueDate:          { type: 'string', format: 'date-time' },
          outstandingKobo:  { type: 'integer', example: 4513353, description: 'Amount still owed on this instalment in kobo' },
        },
      },
      Loan: {
        type: 'object',
        properties: {
          id:                      { type: 'string', format: 'uuid' },
          principalKobo:           { type: 'integer', example: 50000000, description: '₦500,000 in kobo' },
          interestRate:            { type: 'string', example: '15.00' },
          termMonths:              { type: 'integer', example: 12 },
          monthlyInstalmentKobo:   { type: 'integer', example: 4513353 },
          totalOwedKobo:           { type: 'integer', example: 54160236 },
          balanceKobo:             { type: 'integer', example: 45133530 },
          status:                  { type: 'string', enum: ['PENDING', 'ACTIVE', 'PAID', 'DEFAULTED', 'REJECTED'] },
          purpose:                 { type: 'string', nullable: true, example: 'School fees' },
          disbursedAt:             { type: 'string', format: 'date-time', nullable: true },
          dueAt:                   { type: 'string', format: 'date-time', nullable: true },
          createdAt:               { type: 'string', format: 'date-time' },
          nextDue:                 { $ref: '#/components/schemas/NextDue' },
        },
      },

      // ── Instalments ───────────────────────────────────────────────────────
      Instalment: {
        type: 'object',
        properties: {
          id:                   { type: 'string', format: 'uuid' },
          instalmentNumber:     { type: 'integer', example: 1 },
          dueDate:              { type: 'string', format: 'date-time' },
          principalKobo:        { type: 'integer', example: 4138353 },
          interestKobo:         { type: 'integer', example: 375000 },
          totalDueKobo:         { type: 'integer', example: 4513353 },
          overdueChargeKobo:    { type: 'integer', example: 0, description: '5% penalty rolled in from a missed previous instalment' },
          amountPaidKobo:       { type: 'integer', example: 0 },
          outstandingKobo:      { type: 'integer', example: 4513353 },
          status:               { type: 'string', enum: ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'ROLLED_OVER'] },
          paidAt:               { type: 'string', format: 'date-time', nullable: true },
        },
      },

      // ── Repayments ────────────────────────────────────────────────────────
      Repayment: {
        type: 'object',
        properties: {
          id:          { type: 'string', format: 'uuid' },
          loanId:      { type: 'string', format: 'uuid' },
          amountKobo:  { type: 'integer', example: 4513353 },
          reference:   { type: 'string', example: 'uuid-v4-idempotency-key' },
          status:      { type: 'string', enum: ['PENDING', 'SUCCESS', 'FAILED'] },
          paidAt:      { type: 'string', format: 'date-time', nullable: true },
          createdAt:   { type: 'string', format: 'date-time' },
        },
      },

      // ── Calculator ────────────────────────────────────────────────────────
      ScheduleRow: {
        type: 'object',
        properties: {
          month:               { type: 'integer', example: 1 },
          principalKobo:       { type: 'integer', example: 4138353 },
          interestKobo:        { type: 'integer', example: 375000 },
          instalmentKobo:      { type: 'integer', example: 4513353 },
          remainingBalanceKobo:{ type: 'integer', example: 45861647 },
        },
      },
      CalculationResult: {
        type: 'object',
        properties: {
          amountKobo:           { type: 'integer', example: 50000000 },
          termMonths:           { type: 'integer', example: 12 },
          annualInterestRate:   { type: 'string', example: '15.00%' },
          monthlyInstalmentKobo:{ type: 'integer', example: 4513353 },
          totalRepaymentKobo:   { type: 'integer', example: 54160236 },
          totalInterestKobo:    { type: 'integer', example: 4160236 },
          schedule: {
            type: 'array',
            items: { $ref: '#/components/schemas/ScheduleRow' },
          },
        },
      },
    },
  },

  // ── Paths ──────────────────────────────────────────────────────────────────
  paths: {

    // ── Auth ────────────────────────────────────────────────────────────────
    '/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account',
        description: 'Registers the user and sends an OTP to the phone number.',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['phone', 'password'],
            properties: {
              phone:     { type: 'string', example: '08012345678' },
              email:     { type: 'string', example: 'ada@example.com' },
              password:  { type: 'string', example: 'MyPass1234' },
              firstName: { type: 'string', example: 'Ada' },
              lastName:  { type: 'string', example: 'Lovelace' },
            },
          }),
        },
        responses: {
          '201': { description: 'Account created — OTP sent to phone', ...json({ $ref: '#/components/schemas/Message' }) },
          '400': err('VALIDATION_ERROR'),
          '409': err('ACCOUNT_EXISTS'),
          '429': err('RATE_LIMITED'),
        },
      },
    },

    '/auth/otp/send': {
      post: {
        tags: ['Auth'],
        summary: 'Resend OTP',
        description: 'Always returns 200 regardless of whether the phone is registered (enumeration prevention).',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['phone'],
            properties: { phone: { type: 'string', example: '08012345678' } },
          }),
        },
        responses: {
          '200': { description: 'OTP sent (or silently ignored)', ...json({ $ref: '#/components/schemas/Message' }) },
          '429': err('RATE_LIMITED'),
        },
      },
    },

    '/auth/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP (signup flow)',
        description: 'Marks the phone as verified and issues tokens.',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['phone', 'code'],
            properties: {
              phone: { type: 'string', example: '08055555555' },
              code:  { type: 'string', example: '123456' },
            },
          }),
        },
        responses: {
          '200': {
            description: 'Phone verified — tokens issued',
            ...json({
              allOf: [
                { $ref: '#/components/schemas/Message' },
                { $ref: '#/components/schemas/Tokens' },
              ],
            }),
          },
          '400': err('OTP_INVALID'),
          '429': err('OTP_TOO_MANY_ATTEMPTS'),
        },
      },
    },

    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login step 1 — verify password',
        description:
          'Checks phone + password. On success, sends an OTP to the phone. ' +
          'No tokens are returned yet — proceed to `POST /auth/login/verify-otp`.',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['phone', 'password'],
            properties: {
              phone:    { type: 'string', example: '08011111111' },
              password: { type: 'string', example: 'Password123' },
            },
          }),
        },
        responses: {
          '200': { description: 'Password correct — OTP sent to phone', ...json({ $ref: '#/components/schemas/Message' }) },
          '401': err('INVALID_CREDENTIALS'),
          '403': err('PHONE_NOT_VERIFIED — account exists but OTP was never completed'),
          '429': err('RATE_LIMITED'),
        },
      },
    },

    '/auth/login/verify-otp': {
      post: {
        tags: ['Auth'],
        summary: 'Login step 2 — verify OTP and get tokens',
        description: 'Consumes the OTP that was sent during login and issues a token pair.',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['phone', 'code'],
            properties: {
              phone: { type: 'string', example: '08011111111' },
              code:  { type: 'string', example: '654321' },
            },
          }),
        },
        responses: {
          '200': {
            description: 'Logged in',
            ...json({
              allOf: [
                { $ref: '#/components/schemas/Tokens' },
                {
                  type: 'object',
                  properties: {
                    user: {
                      type: 'object',
                      properties: {
                        id:             { type: 'string', format: 'uuid' },
                        phone:          { type: 'string' },
                        email:          { type: 'string', nullable: true },
                        firstName:      { type: 'string', nullable: true },
                        lastName:       { type: 'string', nullable: true },
                        profileImage:   { type: 'string', nullable: true },
                        identityStatus: { type: 'string' },
                      },
                    },
                  },
                },
              ],
            }),
          },
          '400': err('OTP_INVALID'),
          '429': err('OTP_TOO_MANY_ATTEMPTS'),
        },
      },
    },

    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate tokens',
        description: 'The old refresh token is revoked immediately. Using a revoked token kills all sessions for that user.',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['refreshToken'],
            properties: { refreshToken: { type: 'string' } },
          }),
        },
        responses: {
          '200': { description: 'New token pair', ...json({ $ref: '#/components/schemas/Tokens' }) },
          '401': err('INVALID_REFRESH_TOKEN'),
        },
      },
    },

    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke a refresh token',
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['refreshToken'],
            properties: { refreshToken: { type: 'string' } },
          }),
        },
        responses: {
          '200': { description: 'Logged out', ...json({ $ref: '#/components/schemas/Message' }) },
        },
      },
    },

    // ── User ────────────────────────────────────────────────────────────────
    '/me': {
      get: {
        tags: ['User'],
        summary: 'Get profile',
        security: bearer,
        responses: {
          '200': { description: 'Current user', ...json({ $ref: '#/components/schemas/UserProfile' }) },
          '401': err('UNAUTHORIZED or TOKEN_EXPIRED'),
          '404': err('USER_NOT_FOUND'),
        },
      },
      patch: {
        tags: ['User'],
        summary: 'Update profile',
        description: 'All fields are optional. Only provided fields are updated.',
        security: bearer,
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            properties: {
              firstName:    { type: 'string', example: 'Ada' },
              lastName:     { type: 'string', example: 'Lovelace' },
              email:        { type: 'string', format: 'email', example: 'new@example.com' },
              profileImage: { type: 'string', format: 'uri', example: 'https://cdn.example.com/photo.jpg' },
            },
          }),
        },
        responses: {
          '200': { description: 'Updated profile', ...json({ $ref: '#/components/schemas/UserProfile' }) },
          '400': err('VALIDATION_ERROR or NO_CHANGES'),
          '409': err('EMAIL_TAKEN'),
          '401': err('UNAUTHORIZED'),
        },
      },
    },

    '/me/avatar': {
      post: {
        tags: ['User'],
        summary: 'Upload profile photo',
        description: 'Accepts `multipart/form-data` with a single field named **avatar** (JPEG, PNG or WebP, max 5 MB). Returns the updated profile with the new `profileImage` URL.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['avatar'],
                properties: {
                  avatar: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Photo uploaded', ...json({ $ref: '#/components/schemas/UserProfile' }) },
          '400': err('NO_FILE'),
          '415': err('UNSUPPORTED_MEDIA — only JPEG, PNG, WebP'),
          '401': err('UNAUTHORIZED'),
        },
      },
    },

    // ── Calculator (public) ─────────────────────────────────────────────────
    '/loans/calculate': {
      get: {
        tags: ['Calculator'],
        summary: 'Calculate repayment breakdown',
        description:
          'Pure computation — no auth required. Returns monthly instalment, total repayment, ' +
          'total interest, and a full month-by-month amortisation table.',
        parameters: [
          {
            name: 'amountKobo',
            in: 'query',
            required: true,
            description: 'Loan principal in kobo (e.g. 50000000 = ₦500,000)',
            schema: { type: 'integer', minimum: 1000000, maximum: 500000000, example: 50000000 },
          },
          {
            name: 'termMonths',
            in: 'query',
            required: true,
            description: 'Repayment term in months',
            schema: { type: 'integer', minimum: 1, maximum: 60, example: 12 },
          },
        ],
        responses: {
          '200': { description: 'Repayment breakdown', ...json({ $ref: '#/components/schemas/CalculationResult' }) },
          '400': err('VALIDATION_ERROR'),
        },
      },
    },

    // ── Loans ────────────────────────────────────────────────────────────────
    '/loans': {
      post: {
        tags: ['Loans'],
        summary: 'Apply for a loan',
        description:
          'Creates a new loan in ACTIVE status with a full instalment schedule. ' +
          'Blocked if the user already has an ACTIVE or PENDING loan.',
        security: bearer,
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['amountKobo', 'termMonths'],
            properties: {
              amountKobo:  { type: 'integer', example: 50000000, description: '₦500,000' },
              termMonths:  { type: 'integer', example: 12 },
              purpose:     { type: 'string', example: 'School fees', maxLength: 100 },
            },
          }),
        },
        responses: {
          '201': { description: 'Loan created', ...json({ $ref: '#/components/schemas/Loan' }) },
          '400': err('VALIDATION_ERROR'),
          '401': err('UNAUTHORIZED'),
          '409': err('LOAN_EXISTS — active or pending loan already exists'),
          '429': err('RATE_LIMITED — max 5 applications per hour'),
        },
      },
      get: {
        tags: ['Loans'],
        summary: 'List all loans',
        description: 'Returns all loans for the current user, newest first. Each item includes `nextDue`.',
        security: bearer,
        responses: {
          '200': {
            description: 'Loan list',
            ...json({ type: 'array', items: { $ref: '#/components/schemas/Loan' } }),
          },
          '401': err('UNAUTHORIZED'),
        },
      },
    },

    '/loans/{loanId}': {
      get: {
        tags: ['Loans'],
        summary: 'Get a loan by ID',
        security: bearer,
        parameters: [uuidParam('loanId', 'Loan UUID')],
        responses: {
          '200': { description: 'Loan detail', ...json({ $ref: '#/components/schemas/Loan' }) },
          '401': err('UNAUTHORIZED'),
          '404': err('NOT_FOUND'),
        },
      },
    },

    // ── Instalment schedule ───────────────────────────────────────────────────
    '/loans/{loanId}/schedule': {
      get: {
        tags: ['Schedule'],
        summary: 'Get instalment schedule',
        description:
          'Returns all monthly instalments for a loan in order. ' +
          'Each row includes base amount, any overdue charge rolled in from a missed instalment, ' +
          'amount already paid, and the outstanding balance.',
        security: bearer,
        parameters: [uuidParam('loanId', 'Loan UUID')],
        responses: {
          '200': {
            description: 'Full schedule',
            ...json({ type: 'array', items: { $ref: '#/components/schemas/Instalment' } }),
          },
          '401': err('UNAUTHORIZED'),
          '404': err('NOT_FOUND'),
        },
      },
    },

    // ── Repayments ────────────────────────────────────────────────────────────
    '/loans/{loanId}/repay': {
      post: {
        tags: ['Repayments'],
        summary: 'Make a repayment',
        description:
          'Supports both full and part payment. The amount is applied to the earliest unpaid ' +
          'instalment first; any excess cascades to subsequent instalments. ' +
          'Use a unique `reference` per attempt for idempotency.',
        security: bearer,
        parameters: [uuidParam('loanId', 'Loan UUID')],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['amountKobo', 'reference'],
            properties: {
              amountKobo: { type: 'integer', example: 4513353, description: 'Amount to pay in kobo' },
              reference:  { type: 'string', example: 'uuid-v4', description: 'Idempotency key — generate a UUID per payment attempt' },
            },
          }),
        },
        responses: {
          '201': { description: 'Repayment recorded', ...json({ $ref: '#/components/schemas/Repayment' }) },
          '400': err('LOAN_NOT_ACTIVE or OVERPAYMENT or AMOUNT_TOO_SMALL'),
          '401': err('UNAUTHORIZED'),
          '404': err('NOT_FOUND'),
          '409': err('DUPLICATE_REFERENCE'),
        },
      },
    },

    '/loans/{loanId}/repayments': {
      get: {
        tags: ['Repayments'],
        summary: 'List repayments for a loan',
        security: bearer,
        parameters: [uuidParam('loanId', 'Loan UUID')],
        responses: {
          '200': {
            description: 'Repayment history',
            ...json({ type: 'array', items: { $ref: '#/components/schemas/Repayment' } }),
          },
          '401': err('UNAUTHORIZED'),
          '404': err('NOT_FOUND'),
        },
      },
    },

    '/repayments': {
      get: {
        tags: ['Repayments'],
        summary: 'List all repayments (across all loans)',
        description: 'Useful for the repayment history tab — returns repayments for every loan the user has ever had.',
        security: bearer,
        responses: {
          '200': {
            description: 'All repayments',
            ...json({ type: 'array', items: { $ref: '#/components/schemas/Repayment' } }),
          },
          '401': err('UNAUTHORIZED'),
        },
      },
    },
  },
};

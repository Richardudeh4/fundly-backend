import bcrypt from 'bcrypt';
import { db, pool } from './db';
import { users, otpCodes, refreshTokens } from './db/schema';
import { hashOtp } from './utils/otp';
import { config } from './config';

const TEST_PASSWORD = 'Password123';
const TEST_OTP = '123456';

async function seed() {
  if (config.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database.');
  }

  console.log('Clearing old data...');
  await db.delete(refreshTokens);
  await db.delete(otpCodes);
  await db.delete(users);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  console.log('Inserting users...');
  const inserted = await db
    .insert(users)
    .values([
      {
        phone: '+2348011111111',
        email: 'ada@example.com',
        passwordHash,
        phoneVerified: true,
        identityStatus: 'VERIFIED',
      },
      {
        phone: '+2348022222222',
        email: 'chinedu@example.com',
        passwordHash,
        phoneVerified: true,
        identityStatus: 'NOT_STARTED',
      },
      {
        phone: '+2348033333333',
        email: 'emeka@example.com',
        passwordHash,
        phoneVerified: true,
        identityStatus: 'PENDING',
      },
      {
        phone: '+2348044444444',
        email: 'ngozi@example.com',
        passwordHash,
        phoneVerified: true,
        identityStatus: 'FAILED',
      },
      {
        // Signed up but has not entered the OTP yet
        phone: '+2348055555555',
        email: 'fatima@example.com',
        passwordHash,
        phoneVerified: false,
        identityStatus: 'NOT_STARTED',
      },
    ])
    .returning({ id: users.id, phone: users.phone });

  const fatima = inserted.find((u) => u.phone === '+2348055555555')!;

  console.log('Inserting a pending OTP for Fatima...');
  await db.insert(otpCodes).values({
    userId: fatima.id,
    codeHash: hashOtp(TEST_OTP),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // valid for 24 hours
  });

  console.log('\nSeed complete. Test accounts:');
  console.table([
    { name: 'Ada', phone: '08011111111', state: 'verified phone, identity VERIFIED' },
    { name: 'Chinedu', phone: '08022222222', state: 'verified phone, identity NOT_STARTED' },
    { name: 'Emeka', phone: '08033333333', state: 'verified phone, identity PENDING' },
    { name: 'Ngozi', phone: '08044444444', state: 'verified phone, identity FAILED' },
    { name: 'Fatima', phone: '08055555555', state: `phone NOT verified, OTP is ${TEST_OTP}` },
  ]);
  console.log(`Password for every account: ${TEST_PASSWORD}`);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
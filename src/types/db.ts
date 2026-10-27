export type UserRow = {
  id: string;
  phone: string;
  email: string | null;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  profile_image: string | null;
  phone_verified: boolean;
  identity_status: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'FAILED';
  created_at: Date;
};

export type OtpRow = {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: Date;
  attempts: number;
  used: boolean;
  created_at: Date;
};

export type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked: boolean;
  created_at: Date;
};

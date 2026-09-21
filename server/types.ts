/**
 * MSAP 53rd Freshers' Meet 2026 - Data Models & Interfaces
 */

export type AttendeeCategory = 'FRESHER' | 'SENIOR';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';
export type RegistrationStatus = 'REGISTERED' | 'CANCELLED';
export type CheckInStatus = 'NOT_CHECKED_IN' | 'CHECKED_IN';

export interface Attendee {
  id: number;
  ticket_id: string; // e.g. "FM26-001"
  full_name: string;
  phone: string;
  email: string;
  college: string;
  category: AttendeeCategory;
  payment_status: PaymentStatus;
  registration_status: RegistrationStatus;
  qr_token: string; // Cryptographically random secure token for gate check-in
  access_token: string; // Secure token for user ticket retrieval
  check_in_status: CheckInStatus;
  google_response_id?: string | null;
  student_roll_id?: string | null;
  payment_utr?: string | null;
  payment_confirmed_at?: string | null;
  payment_confirmed_by?: string | null;
  check_in_time?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: number;
  email: string;
  password_hash: string;
  role: 'ADMIN' | 'SUPERADMIN';
  created_at: string;
}

export interface CheckinRecord {
  id: number;
  attendee_id: number;
  ticket_id: string;
  checked_in_by: string;
  check_in_time: string;
}

export interface DashboardStats {
  total_registered: number;
  total_paid: number;
  payment_pending: number;
  total_checked_in: number;
  not_checked_in: number;
  total_freshers: number;
  total_seniors: number;
}

export interface CreateRegistrationDTO {
  fullName: string;
  phone: string;
  email: string;
  college: string;
  category: AttendeeCategory;
  rollId?: string;
  paymentUtr?: string;
  googleResponseId?: string;
}

export interface VerifyQrResult {
  status: 'VALID' | 'ALREADY_CHECKED_IN' | 'PAYMENT_PENDING' | 'INVALID';
  message: string;
  attendee?: {
    id: number;
    ticket_id: string;
    full_name: string;
    category: AttendeeCategory;
    college: string;
    phone: string;
    email: string;
    payment_status: PaymentStatus;
    check_in_status: CheckInStatus;
    check_in_time?: string | null;
    payment_confirmed_at?: string | null;
  };
}

export interface AuthTokenPayload {
  id: number;
  email: string;
  role: string;
}

export type AttendeeCategory = 'FRESHER' | 'SENIOR';
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
export type EntryPassStatus = 'NOT_CREATED' | 'ACTIVE' | 'CHECKED_IN' | 'REVOKED';
export type CheckInStatus = 'NOT_CHECKED_IN' | 'CHECKED_IN';

export interface Attendee {
  id: number;
  ticket_id: string | null;
  full_name: string;
  phone: string;
  email: string;
  college: string;
  category: AttendeeCategory;
  payment_status: PaymentStatus;
  entry_pass_status: EntryPassStatus;
  registration_status: string;
  qr_token: string | null;
  access_token: string;
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

export interface DigitalPassData {
  ticketId: string | null;
  fullName: string;
  category: AttendeeCategory;
  college: string;
  paymentStatus: PaymentStatus;
  entryPassStatus: EntryPassStatus;
  checkInStatus: CheckInStatus;
  checkInTime?: string | null;
  paymentUtr?: string | null;
  qrToken?: string | null;
  qrSvg?: string;
  eventDate: string;
  doorsOpen: string;
  venue: string;
  eventName: string;
  organization: string;
  amount: string;
  orderId?: string | null;
}

export interface DashboardStats {
  total_registered: number;
  pending_payments: number;
  processing_payments: number;
  successful_payments: number;
  failed_payments: number;
  expired_payments: number;
  refunded_payments: number;
  active_entry_passes: number;
  total_checked_in: number;
  not_checked_in: number;
  total_freshers: number;
  total_seniors: number;
}

export interface VerifyQrResponse {
  status: 'VALID' | 'ALREADY_CHECKED_IN' | 'PAYMENT_NOT_CONFIRMED' | 'ENTRY_PASS_REVOKED' | 'INVALID';
  message: string;
  attendee?: {
    id: number;
    ticket_id: string | null;
    full_name: string;
    category: AttendeeCategory;
    college: string;
    phone: string;
    email: string;
    payment_status: PaymentStatus;
    entry_pass_status: EntryPassStatus;
    check_in_status: CheckInStatus;
    check_in_time?: string | null;
    payment_confirmed_at?: string | null;
  };
}

export interface AdminUser {
  id: number;
  email: string;
  role: string;
}

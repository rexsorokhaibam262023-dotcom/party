export type AttendeeCategory = 'FRESHER' | 'SENIOR';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED';
export type CheckInStatus = 'NOT_CHECKED_IN' | 'CHECKED_IN';

export interface Attendee {
  id: number;
  ticket_id: string;
  full_name: string;
  phone: string;
  email: string;
  college: string;
  category: AttendeeCategory;
  payment_status: PaymentStatus;
  registration_status: string;
  qr_token: string;
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
  ticketId: string;
  fullName: string;
  category: AttendeeCategory;
  college: string;
  paymentStatus: PaymentStatus;
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

export interface VerifyQrResponse {
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

export interface AdminUser {
  id: number;
  email: string;
  role: string;
}

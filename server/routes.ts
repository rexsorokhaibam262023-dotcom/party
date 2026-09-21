import express, { Request, Response } from 'express';
import QRCode from 'qrcode';
import {
  createAttendee,
  getAttendeeByAccessToken,
  lookupAttendee,
  confirmPayment,
  verifyQrToken,
  performCheckIn,
  getDashboardStats,
  listAttendees,
  getAttendeeById,
  findAdminByEmail,
  isUsingMySQL,
} from './db.js';
import { comparePassword, generateAdminToken, requireAdminAuth, AuthenticatedRequest } from './auth.js';
import { sendTicketConfirmationEmail } from './email.js';

const router = express.Router();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'msap_google_sheets_secret_token_2026';

// Simple in-memory rate limiter for sensitive routes
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetTime < now) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count++;
  return true;
}

// ----------------------------------------------------
// 1. Health & Environment Status
// ----------------------------------------------------
router.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'MSAP 53rd Freshers Meet 2026 API',
    event: "MSAP 53rd Freshers' Meet 2026",
    database: isUsingMySQL() ? 'MySQL (Live Connection)' : 'Relational Storage Engine',
    timestamp: new Date().toISOString(),
  });
});

// ----------------------------------------------------
// 2. Public Registration Intake (Direct / Simulator)
// ----------------------------------------------------
router.post('/registrations', async (req: Request, res: Response) => {
  try {
    const { fullName, phone, email, college, category, rollId, paymentUtr } = req.body;

    if (!fullName || !phone || !email) {
      return res.status(400).json({ error: 'Full Name, Phone Number, and Email are required.' });
    }

    const attendee = await createAttendee({
      fullName: String(fullName).trim(),
      phone: String(phone).trim(),
      email: String(email).trim().toLowerCase(),
      college: String(college || 'MSAP Architecture & Planning').trim(),
      category: category === 'SENIOR' ? 'SENIOR' : 'FRESHER',
      rollId: rollId ? String(rollId).trim() : undefined,
      paymentUtr: paymentUtr ? String(paymentUtr).trim() : undefined,
    });

    res.status(201).json({
      success: true,
      message: 'Registration created successfully. Payment verification pending.',
      attendee: {
        id: attendee.id,
        ticket_id: attendee.ticket_id,
        full_name: attendee.full_name,
        category: attendee.category,
        payment_status: attendee.payment_status,
        access_token: attendee.access_token,
      },
    });
  } catch (err: unknown) {
    console.error('Error creating registration:', err);
    res.status(500).json({ error: 'Failed to process registration.' });
  }
});

// ----------------------------------------------------
// 3. Google Apps Script Webhook
// ----------------------------------------------------
router.post('/webhook/google-form', async (req: Request, res: Response) => {
  try {
    const tokenHeader = req.headers['x-webhook-token'] || req.query.secret;
    if (tokenHeader !== WEBHOOK_SECRET) {
      console.warn('[WEBHOOK] Unauthorized Google Apps Script webhook attempt rejected.');
      return res.status(401).json({ error: 'Unauthorized webhook invocation.' });
    }

    const { fullName, phone, email, college, category, rollId, paymentUtr, googleResponseId } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ error: 'Incomplete Google Form response data.' });
    }

    const attendee = await createAttendee({
      fullName: String(fullName).trim(),
      phone: String(phone).trim(),
      email: String(email || '').trim().toLowerCase(),
      college: String(college || 'MSAP Architecture').trim(),
      category: category === 'SENIOR' ? 'SENIOR' : 'FRESHER',
      rollId: rollId ? String(rollId).trim() : undefined,
      paymentUtr: paymentUtr ? String(paymentUtr).trim() : undefined,
      googleResponseId: googleResponseId ? String(googleResponseId).trim() : undefined,
    });

    console.log(`[WEBHOOK] Synchronized Google Form response. Assigned Ticket ID: ${attendee.ticket_id}`);

    res.status(200).json({
      success: true,
      ticketId: attendee.ticket_id,
      paymentStatus: attendee.payment_status,
      accessToken: attendee.access_token,
      attendeeId: attendee.id,
    });
  } catch (err: unknown) {
    console.error('Error processing Google Apps Script webhook:', err);
    res.status(500).json({ error: 'Webhook processing error.' });
  }
});

// ----------------------------------------------------
// 4. Secure Pass Lookup (Public)
// ----------------------------------------------------
router.get('/tickets/lookup', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const ip = req.ip || 'global';
    if (!checkRateLimit(`lookup_${ip}`, 30, 60000)) {
      return res.status(429).json({ error: 'Too many search requests. Please wait a moment.' });
    }

    if (!query || query.trim().length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters.' });
    }

    const attendee = await lookupAttendee(query);
    if (!attendee) {
      return res.status(404).json({ error: 'No matching pass found for this search.' });
    }

    // Return the safe access token so the frontend can load their pass securely
    res.json({
      success: true,
      accessToken: attendee.access_token,
      ticketId: attendee.ticket_id,
      fullName: attendee.full_name,
    });
  } catch (err) {
    console.error('Lookup error:', err);
    res.status(500).json({ error: 'Internal lookup error.' });
  }
});

// ----------------------------------------------------
// 5. Secure Digital Pass Access (Public via Token)
// ----------------------------------------------------
router.get('/tickets/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const attendee = await getAttendeeByAccessToken(token);

    if (!attendee) {
      return res.status(404).json({ error: 'Digital entry pass not found or invalid token.' });
    }

    // Generate high-contrast SVG QR Code on server
    // For PAID tickets, QR payload is the secure cryptographically random qr_token
    // For PENDING tickets, QR is not active yet
    let qrSvg = '';
    const isPaid = attendee.payment_status === 'PAID';
    const qrPayload = isPaid ? attendee.qr_token : 'PAYMENT_PENDING_VOUCHER_INACTIVE';

    try {
      qrSvg = await QRCode.toString(qrPayload, {
        type: 'svg',
        margin: 2,
        color: {
          dark: '#0B0F19',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H',
      });
    } catch {
      // Fallback
    }

    res.json({
      success: true,
      ticket: {
        ticketId: attendee.ticket_id,
        fullName: attendee.full_name,
        category: attendee.category,
        college: attendee.college,
        paymentStatus: attendee.payment_status,
        checkInStatus: attendee.check_in_status,
        checkInTime: attendee.check_in_time,
        paymentUtr: attendee.payment_utr,
        qrToken: isPaid ? attendee.qr_token : null,
        qrSvg,
        eventDate: '02 OCT 2026',
        doorsOpen: '5:30 PM Sharp',
        venue: 'Pune (MSAP Campus Main Auditorium)',
        eventName: "53rd Freshers' Meet 2026",
        organization: "Manipur Students' Association Pune (MSAP)",
        amount: '₹350',
      },
    });
  } catch (err) {
    console.error('Ticket access error:', err);
    res.status(500).json({ error: 'Failed to retrieve digital pass.' });
  }
});

// ----------------------------------------------------
// 6. Admin Authentication (POST /api/admin/login)
// ----------------------------------------------------
router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const ip = req.ip || 'admin_ip';
    if (!checkRateLimit(`login_${ip}`, 10, 60000)) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again in 1 minute.' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const admin = await findAdminByEmail(email);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    const isValid = await comparePassword(password, admin.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    const token = generateAdminToken({
      id: admin.id,
      email: admin.email,
      role: admin.role,
    });

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Authentication service error.' });
  }
});

// ----------------------------------------------------
// 7. Authenticated Admin Endpoints (Require Admin JWT)
// ----------------------------------------------------

// Verify Admin Session
router.get('/admin/me', requireAdminAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, admin: req.admin });
});

// Admin Dashboard Stats
router.get('/admin/dashboard', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await getDashboardStats();
    res.json({ success: true, stats });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to load dashboard statistics.' });
  }
});

// List / Search / Filter Attendees
router.get('/admin/attendees', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = req.query.search as string;
    const category = req.query.category as string;
    const paymentStatus = req.query.payment_status as string;
    const checkInStatus = req.query.check_in_status as string;
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const result = await listAttendees({
      search,
      category,
      paymentStatus,
      checkInStatus,
      limit,
      offset,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('List attendees error:', err);
    res.status(500).json({ error: 'Failed to retrieve attendees.' });
  }
});

// Single Attendee Details
router.get('/admin/attendees/:id', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const attendee = await getAttendeeById(id);
    if (!attendee) {
      return res.status(404).json({ error: 'Attendee not found.' });
    }
    res.json({ success: true, attendee });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching attendee record.' });
  }
});

// Confirm Payment
router.post('/admin/attendees/:id/confirm-payment', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const adminEmail = req.admin?.email || 'admin@msap.org';

    const attendee = await confirmPayment(id, adminEmail);
    if (!attendee) {
      return res.status(404).json({ error: 'Attendee record not found.' });
    }

    console.log(`[PAYMENT] Attendee ${attendee.ticket_id} confirmed by ${adminEmail}`);

    // Optional email dispatch hook
    if (attendee.email) {
      const passUrl = `${req.protocol}://${req.get('host')}/#ticket_${attendee.access_token}`;
      sendTicketConfirmationEmail({
        toEmail: attendee.email,
        recipientName: attendee.full_name,
        ticketId: attendee.ticket_id,
        passUrl,
        category: attendee.category,
      }).catch((e) => console.error('Email delivery error:', e));
    }

    res.json({
      success: true,
      message: `Payment confirmed for ${attendee.full_name} (${attendee.ticket_id}). QR entry pass is now ACTIVE.`,
      attendee,
    });
  } catch (err) {
    console.error('Payment confirmation error:', err);
    res.status(500).json({ error: 'Failed to confirm payment.' });
  }
});

// Verify QR Token (Camera Scanner Verification)
router.post('/admin/verify-qr', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ip = req.ip || 'admin_scanner';
    if (!checkRateLimit(`qr_scan_${ip}`, 120, 60000)) {
      return res.status(429).json({ error: 'Scanner telemetry busy. Please retry.' });
    }

    const { qr_token } = req.body;
    if (!qr_token) {
      return res.status(400).json({ error: 'QR token payload required.' });
    }

    const result = await verifyQrToken(String(qr_token));
    res.json(result);
  } catch (err) {
    console.error('Verify QR error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// Confirm Check-In Admittance (Atomic Transaction)
router.post('/admin/check-in', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { attendee_id } = req.body;
    if (!attendee_id) {
      return res.status(400).json({ error: 'Attendee ID required for check-in.' });
    }

    const adminEmail = req.admin?.email || 'Gate Marshall';
    const result = await performCheckIn(parseInt(attendee_id, 10), adminEmail);

    if (!result.success) {
      return res.status(409).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Failed to record check-in.' });
  }
});

export default router;

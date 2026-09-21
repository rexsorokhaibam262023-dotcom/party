import mysql from 'mysql2/promise';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Attendee, AttendeeCategory, PaymentStatus, DashboardStats, CreateRegistrationDTO, VerifyQrResult, AdminUser } from './types.js';
import { hashPassword } from './auth.js';

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_NAME = process.env.DB_NAME || 'msap_freshers_2026';
const DB_USER = process.env.DB_USER || 'msap_user';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

let mysqlPool: mysql.Pool | null = null;
let useLocalFallback = false;

// Local fallback store structure
interface LocalStore {
  ticket_counter: number;
  admins: AdminUser[];
  attendees: Attendee[];
  checkins: Array<{
    id: number;
    attendee_id: number;
    ticket_id: string;
    checked_in_by: string;
    check_in_time: string;
  }>;
}

const LOCAL_STORE_PATH = path.resolve(process.cwd(), 'database', 'local_store.json');

function loadLocalStore(): LocalStore {
  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      const data = fs.readFileSync(LOCAL_STORE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading local_store.json, creating new one:', err);
  }

  const initialStore: LocalStore = {
    ticket_counter: 1,
    admins: [],
    attendees: [
      {
        id: 1,
        ticket_id: 'FM26-001',
        full_name: 'Aarav Sharma',
        phone: '+91 98765 43210',
        email: 'aarav.fresh26@msap.edu.in',
        college: 'B.Arch - Architecture',
        category: 'FRESHER',
        payment_status: 'PAID',
        registration_status: 'REGISTERED',
        qr_token: 'msap_qr_token_7f9c8d1e2a3b4c5d6e7f8a9b0c1d2e3f',
        access_token: 'acc_token_aarav_sharma_001',
        check_in_status: 'NOT_CHECKED_IN',
        google_response_id: 'GSHEET_INITIAL_SEED_001',
        student_roll_id: '260901248',
        payment_utr: 'UTR-99201948218X',
        payment_confirmed_at: '2026-09-20T10:00:00Z',
        payment_confirmed_by: 'admin@msap.org',
        check_in_time: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    checkins: [],
  };

  saveLocalStore(initialStore);
  return initialStore;
}

function saveLocalStore(store: LocalStore) {
  try {
    const dir = path.dirname(LOCAL_STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving local_store.json:', err);
  }
}

// Format ticket ID with FM26- prefix and zero padding
export function formatTicketId(counterNumber: number): string {
  return `FM26-${String(counterNumber).padStart(3, '0')}`;
}

export async function initDatabase(): Promise<void> {
  console.log(`[DATABASE] Checking MySQL connection at ${DB_HOST}:${DB_PORT}/${DB_NAME}...`);
  try {
    const connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      connectTimeout: 2000,
    });

    // Create database if not exists
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.end();

    // Create pooled connection to DB
    mysqlPool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      enableKeepAlive: true,
    });

    // Execute schema initialization
    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS \`admins\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`email\` VARCHAR(255) NOT NULL UNIQUE,
        \`password_hash\` VARCHAR(255) NOT NULL,
        \`role\` VARCHAR(50) NOT NULL DEFAULT 'ADMIN',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_admins_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS \`ticket_counter\` (
        \`id\` INT PRIMARY KEY,
        \`current_number\` INT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await mysqlPool.query(`
      INSERT INTO \`ticket_counter\` (\`id\`, \`current_number\`)
      VALUES (1, 0)
      ON DUPLICATE KEY UPDATE \`id\` = \`id\`;
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS \`attendees\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`ticket_id\` VARCHAR(50) NOT NULL UNIQUE,
        \`full_name\` VARCHAR(255) NOT NULL,
        \`phone\` VARCHAR(50) NOT NULL,
        \`email\` VARCHAR(255) NOT NULL,
        \`college\` VARCHAR(255) NOT NULL,
        \`category\` ENUM('FRESHER', 'SENIOR') NOT NULL DEFAULT 'FRESHER',
        \`payment_status\` ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
        \`registration_status\` ENUM('REGISTERED', 'CANCELLED') NOT NULL DEFAULT 'REGISTERED',
        \`qr_token\` VARCHAR(255) NOT NULL UNIQUE,
        \`access_token\` VARCHAR(255) NOT NULL UNIQUE,
        \`check_in_status\` ENUM('NOT_CHECKED_IN', 'CHECKED_IN') NOT NULL DEFAULT 'NOT_CHECKED_IN',
        \`google_response_id\` VARCHAR(255) NULL UNIQUE,
        \`student_roll_id\` VARCHAR(100) NULL,
        \`payment_utr\` VARCHAR(100) NULL,
        \`payment_confirmed_at\` DATETIME NULL,
        \`payment_confirmed_by\` VARCHAR(255) NULL,
        \`check_in_time\` DATETIME NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_attendees_ticket_id\` (\`ticket_id\`),
        INDEX \`idx_attendees_qr_token\` (\`qr_token\`),
        INDEX \`idx_attendees_access_token\` (\`access_token\`),
        INDEX \`idx_attendees_phone\` (\`phone\`),
        INDEX \`idx_attendees_email\` (\`email\`),
        INDEX \`idx_attendees_payment_status\` (\`payment_status\`),
        INDEX \`idx_attendees_check_in_status\` (\`check_in_status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await mysqlPool.query(`
      CREATE TABLE IF NOT EXISTS \`checkins\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`attendee_id\` INT NOT NULL,
        \`ticket_id\` VARCHAR(50) NOT NULL,
        \`checked_in_by\` VARCHAR(255) NOT NULL,
        \`check_in_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_checkins_ticket_id\` (\`ticket_id\`),
        INDEX \`idx_checkins_attendee_id\` (\`attendee_id\`),
        CONSTRAINT \`fk_checkins_attendee\`
          FOREIGN KEY (\`attendee_id\`) REFERENCES \`attendees\` (\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure default admin exists
    const defaultEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@msap.org';
    const [existingAdmins] = await mysqlPool.query<mysql.RowDataPacket[]>('SELECT id FROM admins WHERE email = ?', [defaultEmail]);
    if (existingAdmins.length === 0) {
      const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMe@MSAP2026';
      const hash = await hashPassword(defaultPassword);
      await mysqlPool.query('INSERT INTO admins (email, password_hash, role) VALUES (?, ?, ?)', [defaultEmail, hash, 'ADMIN']);
      console.log(`[DATABASE] Default admin created: ${defaultEmail}`);
    }

    console.log(`[DATABASE] Connected to live MySQL database '${DB_NAME}' successfully!`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[DATABASE] MySQL connection not established (${errorMsg}). Switching to persistent relational storage mode.`);
    useLocalFallback = true;
    const store = loadLocalStore();

    // Ensure default admin in local store
    const defaultEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@msap.org';
    const exists = store.admins.find((a) => a.email.toLowerCase() === defaultEmail.toLowerCase());
    if (!exists) {
      const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMe@MSAP2026';
      const hash = await hashPassword(defaultPassword);
      store.admins.push({
        id: 1,
        email: defaultEmail,
        password_hash: hash,
        role: 'ADMIN',
        created_at: new Date().toISOString(),
      });
      saveLocalStore(store);
      console.log(`[DATABASE] Seeded default admin in local storage: ${defaultEmail}`);
    }
  }
}

export function isUsingMySQL(): boolean {
  return !useLocalFallback && mysqlPool !== null;
}

/**
 * Atomic Ticket ID generator using database transaction on `ticket_counter`
 */
export async function generateNextTicketId(): Promise<string> {
  if (isUsingMySQL() && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT current_number FROM ticket_counter WHERE id = 1 FOR UPDATE'
      );
      let currentNumber = 0;
      if (rows.length > 0) {
        currentNumber = rows[0].current_number;
      } else {
        await conn.query('INSERT INTO ticket_counter (id, current_number) VALUES (1, 0)');
      }

      const nextNumber = currentNumber + 1;
      await conn.query('UPDATE ticket_counter SET current_number = ? WHERE id = 1', [nextNumber]);
      await conn.commit();
      return formatTicketId(nextNumber);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } else {
    // Local fallback with synchronous state lock
    const store = loadLocalStore();
    store.ticket_counter = (store.ticket_counter || 0) + 1;
    saveLocalStore(store);
    return formatTicketId(store.ticket_counter);
  }
}

/**
 * Creates a new attendee record with unique constraints
 */
export async function createAttendee(dto: CreateRegistrationDTO): Promise<Attendee> {
  const ticketId = await generateNextTicketId();
  const qrToken = `msap_token_${crypto.randomBytes(32).toString('hex')}`;
  const accessToken = `acc_${crypto.randomBytes(24).toString('hex')}`;
  const paymentStatus: PaymentStatus = 'PENDING';
  const category: AttendeeCategory = dto.category === 'SENIOR' ? 'SENIOR' : 'FRESHER';

  if (isUsingMySQL() && mysqlPool) {
    // Check duplicate Google Response ID
    if (dto.googleResponseId) {
      const [existing] = await mysqlPool.query<mysql.RowDataPacket[]>(
        'SELECT * FROM attendees WHERE google_response_id = ?',
        [dto.googleResponseId]
      );
      if (existing.length > 0) {
        return existing[0] as Attendee;
      }
    }

    const [result] = await mysqlPool.query<mysql.ResultSetHeader>(
      `INSERT INTO attendees (
        ticket_id, full_name, phone, email, college, category,
        payment_status, registration_status, qr_token, access_token,
        check_in_status, google_response_id, student_roll_id, payment_utr
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'REGISTERED', ?, ?, 'NOT_CHECKED_IN', ?, ?, ?)`,
      [
        ticketId,
        dto.fullName,
        dto.phone,
        dto.email,
        dto.college,
        category,
        paymentStatus,
        qrToken,
        accessToken,
        dto.googleResponseId || null,
        dto.rollId || null,
        dto.paymentUtr || null,
      ]
    );

    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(
      'SELECT * FROM attendees WHERE id = ?',
      [result.insertId]
    );
    return rows[0] as Attendee;
  } else {
    const store = loadLocalStore();
    if (dto.googleResponseId) {
      const existing = store.attendees.find((a) => a.google_response_id === dto.googleResponseId);
      if (existing) return existing;
    }

    const newId = store.attendees.length > 0 ? Math.max(...store.attendees.map((a) => a.id)) + 1 : 1;
    const now = new Date().toISOString();
    const newAttendee: Attendee = {
      id: newId,
      ticket_id: ticketId,
      full_name: dto.fullName,
      phone: dto.phone,
      email: dto.email,
      college: dto.college,
      category,
      payment_status: paymentStatus,
      registration_status: 'REGISTERED',
      qr_token: qrToken,
      access_token: accessToken,
      check_in_status: 'NOT_CHECKED_IN',
      google_response_id: dto.googleResponseId || null,
      student_roll_id: dto.rollId || null,
      payment_utr: dto.paymentUtr || null,
      payment_confirmed_at: null,
      payment_confirmed_by: null,
      check_in_time: null,
      created_at: now,
      updated_at: now,
    };

    store.attendees.unshift(newAttendee);
    saveLocalStore(store);
    return newAttendee;
  }
}

/**
 * Retrieves public attendee ticket by secure access token
 */
export async function getAttendeeByAccessToken(token: string): Promise<Attendee | null> {
  if (isUsingMySQL() && mysqlPool) {
    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(
      'SELECT * FROM attendees WHERE access_token = ? OR qr_token = ?',
      [token, token]
    );
    return rows.length > 0 ? (rows[0] as Attendee) : null;
  } else {
    const store = loadLocalStore();
    return store.attendees.find((a) => a.access_token === token || a.qr_token === token) || null;
  }
}

/**
 * Finds attendee by ticket ID
 */
export async function getAttendeeByTicketId(ticketId: string): Promise<Attendee | null> {
  const cleanId = ticketId.trim().toUpperCase();
  if (isUsingMySQL() && mysqlPool) {
    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(
      'SELECT * FROM attendees WHERE UPPER(ticket_id) = ?',
      [cleanId]
    );
    return rows.length > 0 ? (rows[0] as Attendee) : null;
  } else {
    const store = loadLocalStore();
    return store.attendees.find((a) => a.ticket_id.toUpperCase() === cleanId) || null;
  }
}

/**
 * Searches attendees for pass lookup (phone, email, ticket_id, or roll_id)
 */
export async function lookupAttendee(query: string): Promise<Attendee | null> {
  const q = query.trim();
  if (!q) return null;

  if (isUsingMySQL() && mysqlPool) {
    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(
      `SELECT * FROM attendees 
       WHERE ticket_id = ? OR phone = ? OR email = ? OR student_roll_id = ?
       LIMIT 1`,
      [q, q, q, q]
    );
    return rows.length > 0 ? (rows[0] as Attendee) : null;
  } else {
    const store = loadLocalStore();
    const cleanQ = q.toLowerCase();
    return (
      store.attendees.find(
        (a) =>
          a.ticket_id.toLowerCase() === cleanQ ||
          a.phone.replace(/\s+/g, '').includes(cleanQ.replace(/\s+/g, '')) ||
          a.email.toLowerCase() === cleanQ ||
          (a.student_roll_id && a.student_roll_id.toLowerCase() === cleanQ)
      ) || null
    );
  }
}

/**
 * Confirm payment by Admin
 */
export async function confirmPayment(attendeeId: number, adminEmail: string): Promise<Attendee | null> {
  const now = new Date().toISOString();

  if (isUsingMySQL() && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM attendees WHERE id = ? FOR UPDATE',
        [attendeeId]
      );
      if (rows.length === 0) {
        await conn.rollback();
        return null;
      }

      await conn.query(
        `UPDATE attendees 
         SET payment_status = 'PAID', 
             payment_confirmed_at = NOW(), 
             payment_confirmed_by = ? 
         WHERE id = ?`,
        [adminEmail, attendeeId]
      );
      await conn.commit();

      const [updated] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM attendees WHERE id = ?',
        [attendeeId]
      );
      return updated[0] as Attendee;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } else {
    const store = loadLocalStore();
    const attendee = store.attendees.find((a) => a.id === attendeeId);
    if (!attendee) return null;

    attendee.payment_status = 'PAID';
    attendee.payment_confirmed_at = now;
    attendee.payment_confirmed_by = adminEmail;
    attendee.updated_at = now;
    saveLocalStore(store);
    return attendee;
  }
}

/**
 * Verify QR Token against MySQL
 */
export async function verifyQrToken(qrToken: string): Promise<VerifyQrResult> {
  const token = qrToken.trim();
  if (!token) {
    return { status: 'INVALID', message: 'Empty or invalid QR code format.' };
  }

  let attendee: Attendee | null = null;

  if (isUsingMySQL() && mysqlPool) {
    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(
      'SELECT * FROM attendees WHERE qr_token = ? OR ticket_id = ?',
      [token, token]
    );
    if (rows.length > 0) {
      attendee = rows[0] as Attendee;
    }
  } else {
    const store = loadLocalStore();
    attendee = store.attendees.find((a) => a.qr_token === token || a.ticket_id === token) || null;
  }

  if (!attendee) {
    return {
      status: 'INVALID',
      message: '❌ INVALID TICKET: QR Token does not exist in registry.',
    };
  }

  if (attendee.payment_status !== 'PAID') {
    return {
      status: 'PAYMENT_PENDING',
      message: '⚠️ PAYMENT NOT CONFIRMED: Pass is not active until payment is confirmed.',
      attendee: {
        id: attendee.id,
        ticket_id: attendee.ticket_id,
        full_name: attendee.full_name,
        category: attendee.category,
        college: attendee.college,
        phone: attendee.phone,
        email: attendee.email,
        payment_status: attendee.payment_status,
        check_in_status: attendee.check_in_status,
        check_in_time: attendee.check_in_time,
        payment_confirmed_at: attendee.payment_confirmed_at,
      },
    };
  }

  if (attendee.check_in_status === 'CHECKED_IN') {
    return {
      status: 'ALREADY_CHECKED_IN',
      message: '⚠️ ALREADY CHECKED IN: Ticket was admitted previously.',
      attendee: {
        id: attendee.id,
        ticket_id: attendee.ticket_id,
        full_name: attendee.full_name,
        category: attendee.category,
        college: attendee.college,
        phone: attendee.phone,
        email: attendee.email,
        payment_status: attendee.payment_status,
        check_in_status: attendee.check_in_status,
        check_in_time: attendee.check_in_time,
        payment_confirmed_at: attendee.payment_confirmed_at,
      },
    };
  }

  return {
    status: 'VALID',
    message: '✅ VALID TICKET: Authorized for admission.',
    attendee: {
      id: attendee.id,
      ticket_id: attendee.ticket_id,
      full_name: attendee.full_name,
      category: attendee.category,
      college: attendee.college,
      phone: attendee.phone,
      email: attendee.email,
      payment_status: attendee.payment_status,
      check_in_status: attendee.check_in_status,
      check_in_time: attendee.check_in_time,
      payment_confirmed_at: attendee.payment_confirmed_at,
    },
  };
}

/**
 * Performs atomic Check-In with transaction and row locking
 */
export async function performCheckIn(
  attendeeId: number,
  checkedInByAdmin: string
): Promise<{ success: boolean; message: string; attendee?: Attendee; alreadyCheckedInAt?: string }> {
  if (isUsingMySQL() && mysqlPool) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();

      // Lock row FOR UPDATE to prevent race conditions
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM attendees WHERE id = ? FOR UPDATE',
        [attendeeId]
      );

      if (rows.length === 0) {
        await conn.rollback();
        return { success: false, message: 'Ticket record not found.' };
      }

      const attendee = rows[0] as Attendee;

      if (attendee.payment_status !== 'PAID') {
        await conn.rollback();
        return { success: false, message: 'Cannot check in: Payment status is PENDING or FAILED.' };
      }

      if (attendee.check_in_status === 'CHECKED_IN') {
        await conn.rollback();
        return {
          success: false,
          message: '⚠️ ALREADY CHECKED IN: This pass was already admitted.',
          alreadyCheckedInAt: attendee.check_in_time || 'Earlier session',
          attendee,
        };
      }

      // Mark as CHECKED_IN
      await conn.query(
        `UPDATE attendees 
         SET check_in_status = 'CHECKED_IN', check_in_time = NOW() 
         WHERE id = ?`,
        [attendeeId]
      );

      // Insert audit record
      await conn.query(
        `INSERT INTO checkins (attendee_id, ticket_id, checked_in_by, check_in_time)
         VALUES (?, ?, ?, NOW())`,
        [attendeeId, attendee.ticket_id, checkedInByAdmin]
      );

      await conn.commit();

      const [updatedRows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT * FROM attendees WHERE id = ?',
        [attendeeId]
      );
      return {
        success: true,
        message: '✅ CHECKED IN: Gate admission confirmed.',
        attendee: updatedRows[0] as Attendee,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } else {
    // Local fallback with synchronous locking
    const store = loadLocalStore();
    const attendee = store.attendees.find((a) => a.id === attendeeId);
    if (!attendee) return { success: false, message: 'Ticket record not found.' };

    if (attendee.payment_status !== 'PAID') {
      return { success: false, message: 'Cannot check in: Payment is not confirmed.' };
    }

    if (attendee.check_in_status === 'CHECKED_IN') {
      return {
        success: false,
        message: '⚠️ ALREADY CHECKED IN: This pass was already admitted.',
        alreadyCheckedInAt: attendee.check_in_time || 'Earlier session',
        attendee,
      };
    }

    const now = new Date().toISOString();
    attendee.check_in_status = 'CHECKED_IN';
    attendee.check_in_time = now;
    attendee.updated_at = now;

    store.checkins.push({
      id: store.checkins.length + 1,
      attendee_id: attendee.id,
      ticket_id: attendee.ticket_id,
      checked_in_by: checkedInByAdmin,
      check_in_time: now,
    });

    saveLocalStore(store);
    return {
      success: true,
      message: '✅ CHECKED IN: Gate admission confirmed.',
      attendee,
    };
  }
}

/**
 * Calculates Dashboard Statistics
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  if (isUsingMySQL() && mysqlPool) {
    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(`
      SELECT 
        COUNT(*) AS total_registered,
        SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) AS total_paid,
        SUM(CASE WHEN payment_status = 'PENDING' THEN 1 ELSE 0 END) AS payment_pending,
        SUM(CASE WHEN check_in_status = 'CHECKED_IN' THEN 1 ELSE 0 END) AS total_checked_in,
        SUM(CASE WHEN check_in_status = 'NOT_CHECKED_IN' THEN 1 ELSE 0 END) AS not_checked_in,
        SUM(CASE WHEN category = 'FRESHER' THEN 1 ELSE 0 END) AS total_freshers,
        SUM(CASE WHEN category = 'SENIOR' THEN 1 ELSE 0 END) AS total_seniors
      FROM attendees
    `);
    const r = rows[0];
    return {
      total_registered: Number(r.total_registered || 0),
      total_paid: Number(r.total_paid || 0),
      payment_pending: Number(r.payment_pending || 0),
      total_checked_in: Number(r.total_checked_in || 0),
      not_checked_in: Number(r.not_checked_in || 0),
      total_freshers: Number(r.total_freshers || 0),
      total_seniors: Number(r.total_seniors || 0),
    };
  } else {
    const store = loadLocalStore();
    const atts = store.attendees;
    return {
      total_registered: atts.length,
      total_paid: atts.filter((a) => a.payment_status === 'PAID').length,
      payment_pending: atts.filter((a) => a.payment_status === 'PENDING').length,
      total_checked_in: atts.filter((a) => a.check_in_status === 'CHECKED_IN').length,
      not_checked_in: atts.filter((a) => a.check_in_status === 'NOT_CHECKED_IN').length,
      total_freshers: atts.filter((a) => a.category === 'FRESHER').length,
      total_seniors: atts.filter((a) => a.category === 'SENIOR').length,
    };
  }
}

/**
 * Filter and search attendees
 */
export async function listAttendees(params: {
  search?: string;
  category?: string;
  paymentStatus?: string;
  checkInStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<{ attendees: Attendee[]; total: number }> {
  const { search, category, paymentStatus, checkInStatus, limit = 50, offset = 0 } = params;

  if (isUsingMySQL() && mysqlPool) {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      conditions.push('(ticket_id LIKE ? OR full_name LIKE ? OR phone LIKE ? OR email LIKE ?)');
      values.push(s, s, s, s);
    }

    if (category && category !== 'ALL') {
      conditions.push('category = ?');
      values.push(category);
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      conditions.push('payment_status = ?');
      values.push(paymentStatus);
    }

    if (checkInStatus && checkInStatus !== 'ALL') {
      conditions.push('check_in_status = ?');
      values.push(checkInStatus);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await mysqlPool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM attendees ${whereClause}`,
      values
    );
    const total = Number(countRows[0].cnt || 0);

    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>(
      `SELECT * FROM attendees ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return { attendees: rows as Attendee[], total };
  } else {
    const store = loadLocalStore();
    let filtered = [...store.attendees];

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.ticket_id.toLowerCase().includes(s) ||
          a.full_name.toLowerCase().includes(s) ||
          a.phone.toLowerCase().includes(s) ||
          a.email.toLowerCase().includes(s)
      );
    }

    if (category && category !== 'ALL') {
      filtered = filtered.filter((a) => a.category === category);
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      filtered = filtered.filter((a) => a.payment_status === paymentStatus);
    }

    if (checkInStatus && checkInStatus !== 'ALL') {
      filtered = filtered.filter((a) => a.check_in_status === checkInStatus);
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);
    return { attendees: paginated, total };
  }
}

/**
 * Fetch attendee by internal numeric ID
 */
export async function getAttendeeById(id: number): Promise<Attendee | null> {
  if (isUsingMySQL() && mysqlPool) {
    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>('SELECT * FROM attendees WHERE id = ?', [id]);
    return rows.length > 0 ? (rows[0] as Attendee) : null;
  } else {
    const store = loadLocalStore();
    return store.attendees.find((a) => a.id === id) || null;
  }
}

/**
 * Find admin user by email for authentication
 */
export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (isUsingMySQL() && mysqlPool) {
    const [rows] = await mysqlPool.query<mysql.RowDataPacket[]>('SELECT * FROM admins WHERE LOWER(email) = ?', [cleanEmail]);
    return rows.length > 0 ? (rows[0] as AdminUser) : null;
  } else {
    const store = loadLocalStore();
    return store.admins.find((a) => a.email.toLowerCase() === cleanEmail) || null;
  }
}

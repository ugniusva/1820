export const LIMITS = {
  total: 24,
  table: 12,
  barstand: 12
};

const IGNORED_CAPACITY_STATUSES = new Set(["cancelled", "no_show"]);

export function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {})
    }
  });
}

export function error(message, status = 400, details = {}) {
  return json({ ok: false, error: message, ...details }, { status });
}

export async function readBody(context) {
  try {
    return await context.request.json();
  } catch (cause) {
    throw new Error("Expected a JSON request body.");
  }
}

export function requireBinding(context, name) {
  const binding = context.env?.[name];
  if (!binding) {
    throw new Error(`Missing D1 binding: ${name}`);
  }
  return binding;
}

export function uid(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseJson(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (cause) {
    return fallback;
  }
}

export function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export function normalizeStatus(value, fallback = "confirmed") {
  return String(value || fallback).trim().toLowerCase() || fallback;
}

export function countsForCapacity(status) {
  return !IGNORED_CAPACITY_STATUSES.has(normalizeStatus(status, ""));
}

export function normalizeArrivalTime(value) {
  const raw = String(value || "19:00").slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : "19:00";
}

export function normalizeDate(value) {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

export async function ensureClientsSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      profile_note TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)").run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS client_notes (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Admin',
      text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_client_notes_customer ON client_notes(customer_id)").run();
}

export async function ensureBookingsSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      public_marker TEXT,
      customer_id TEXT NOT NULL,
      booking_date TEXT NOT NULL,
      booking_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      guests INTEGER NOT NULL,
      seating_type TEXT NOT NULL,
      assigned_tables_json TEXT NOT NULL DEFAULT '[]',
      assigned_bar_seats_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'confirmed',
      server TEXT NOT NULL DEFAULT 'Admin',
      source TEXT NOT NULL DEFAULT 'website',
      requests TEXT NOT NULL DEFAULT '',
      internal_note TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(booking_date)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_reservations_customer ON reservations(customer_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status)").run();
}

export function customerFromPayload(payload, existing = {}) {
  const timestamp = nowIso();
  const name = String(
    payload.name
    || `${payload.first_name || ""} ${payload.last_name || ""}`.trim()
    || existing.name
    || "Website guest"
  ).trim();
  return {
    id: String(payload.id || payload.customerId || payload.customer_id || existing.id || uid("c")),
    name,
    email: String(payload.email ?? existing.email ?? "").trim(),
    phone: String(payload.phone ?? existing.phone ?? "").trim(),
    tags: asArray(payload.tags ?? payload.tags_json ?? existing.tags ?? []),
    profileNote: String(payload.profileNote ?? payload.profile_note ?? existing.profileNote ?? "").trim(),
    payloadJson: JSON.stringify(payload || {}),
    createdAt: existing.createdAt || existing.created_at || payload.createdAt || payload.created_at || timestamp,
    updatedAt: timestamp
  };
}

export function reservationFromPayload(payload, existing = {}) {
  const timestamp = nowIso();
  const seatingType = String(payload.seatingType || payload.seating_type || existing.seatingType || existing.seating_type || "table").trim();
  return {
    id: String(payload.id || existing.id || uid("r")),
    publicMarker: String(payload.publicMarker || payload.public_marker || existing.publicMarker || existing.public_marker || ""),
    customerId: String(payload.customerId || payload.customer_id || existing.customerId || existing.customer_id || ""),
    date: normalizeDate(payload.date || payload.booking_date || existing.date || existing.booking_date),
    time: normalizeArrivalTime(payload.time || payload.booking_time || existing.time || existing.booking_time),
    durationMinutes: 0,
    guests: Number(payload.guests ?? existing.guests ?? 1),
    seatingType: seatingType === "barstand" ? "barstand" : "table",
    assignedTables: asArray(payload.assignedTables ?? payload.assigned_tables ?? existing.assignedTables ?? []),
    assignedBarSeats: asArray(payload.assignedBarSeats ?? payload.assigned_bar_seats ?? existing.assignedBarSeats ?? []),
    status: normalizeStatus(payload.status || existing.status || "confirmed"),
    server: String(payload.server || existing.server || "Admin"),
    source: String(payload.source || existing.source || "admin"),
    requests: String(payload.requests ?? existing.requests ?? ""),
    internalNote: String(payload.internalNote ?? payload.internal_note ?? existing.internalNote ?? ""),
    payloadJson: JSON.stringify(payload || {}),
    createdAt: existing.createdAt || existing.created_at || payload.createdAt || payload.created_at || timestamp,
    updatedAt: timestamp
  };
}

export function noteFromPayload(payload, existing = {}) {
  const timestamp = nowIso();
  return {
    id: String(payload.id || existing.id || uid("n")),
    customerId: String(payload.customerId || payload.customer_id || existing.customerId || existing.customer_id || ""),
    author: String(payload.author || existing.author || "Admin"),
    text: String(payload.text ?? existing.text ?? "").trim(),
    createdAt: existing.createdAt || existing.created_at || payload.createdAt || payload.created_at || timestamp,
    updatedAt: timestamp
  };
}

export function rowToCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    tags: parseJson(row.tags_json, []),
    profileNote: row.profile_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function rowToReservation(row) {
  return {
    id: row.id,
    publicMarker: row.public_marker || "",
    customerId: row.customer_id,
    date: row.booking_date,
    time: row.booking_time,
    durationMinutes: Number(row.duration_minutes || 0),
    guests: Number(row.guests || 0),
    seatingType: row.seating_type,
    assignedTables: parseJson(row.assigned_tables_json, []),
    assignedBarSeats: parseJson(row.assigned_bar_seats_json, []),
    status: row.status,
    server: row.server,
    source: row.source,
    requests: row.requests,
    internalNote: row.internal_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    booking_date: row.booking_date,
    booking_time: row.booking_time,
    seating_type: row.seating_type
  };
}

export function rowToNote(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customer_id: row.customer_id,
    author: row.author,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function findCustomerByContact(db, email, phone) {
  const cleanEmail = String(email || "").trim();
  const cleanPhone = String(phone || "").trim();
  if (cleanEmail) {
    const row = await db.prepare("SELECT * FROM customers WHERE lower(email) = lower(?) LIMIT 1").bind(cleanEmail).first();
    if (row) return rowToCustomer(row);
  }
  if (cleanPhone) {
    const row = await db.prepare("SELECT * FROM customers WHERE phone = ? LIMIT 1").bind(cleanPhone).first();
    if (row) return rowToCustomer(row);
  }
  return null;
}

export async function getCustomerById(db, id) {
  const row = await db.prepare("SELECT * FROM customers WHERE id = ? LIMIT 1").bind(id).first();
  return row ? rowToCustomer(row) : null;
}

export async function getReservationById(db, id) {
  const row = await db.prepare("SELECT * FROM reservations WHERE id = ? LIMIT 1").bind(id).first();
  return row ? rowToReservation(row) : null;
}

export async function upsertCustomer(db, customer) {
  await db.prepare(`
    INSERT INTO customers (id, name, email, phone, tags_json, profile_note, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      phone = excluded.phone,
      tags_json = excluded.tags_json,
      profile_note = excluded.profile_note,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(
    customer.id,
    customer.name,
    customer.email,
    customer.phone,
    JSON.stringify(customer.tags || []),
    customer.profileNote || "",
    customer.payloadJson || "{}",
    customer.createdAt,
    customer.updatedAt
  ).run();
  return customer;
}

export async function upsertReservation(db, reservation) {
  await db.prepare(`
    INSERT INTO reservations (
      id, public_marker, customer_id, booking_date, booking_time, duration_minutes, guests,
      seating_type, assigned_tables_json, assigned_bar_seats_json, status, server, source,
      requests, internal_note, payload_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      public_marker = excluded.public_marker,
      customer_id = excluded.customer_id,
      booking_date = excluded.booking_date,
      booking_time = excluded.booking_time,
      duration_minutes = excluded.duration_minutes,
      guests = excluded.guests,
      seating_type = excluded.seating_type,
      assigned_tables_json = excluded.assigned_tables_json,
      assigned_bar_seats_json = excluded.assigned_bar_seats_json,
      status = excluded.status,
      server = excluded.server,
      source = excluded.source,
      requests = excluded.requests,
      internal_note = excluded.internal_note,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).bind(
    reservation.id,
    reservation.publicMarker,
    reservation.customerId,
    reservation.date,
    reservation.time,
    reservation.durationMinutes,
    reservation.guests,
    reservation.seatingType,
    JSON.stringify(reservation.assignedTables || []),
    JSON.stringify(reservation.assignedBarSeats || []),
    reservation.status,
    reservation.server,
    reservation.source,
    reservation.requests,
    reservation.internalNote,
    reservation.payloadJson || "{}",
    reservation.createdAt,
    reservation.updatedAt
  ).run();
  return reservation;
}

export async function upsertNote(db, note) {
  await db.prepare(`
    INSERT INTO client_notes (id, customer_id, author, text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      customer_id = excluded.customer_id,
      author = excluded.author,
      text = excluded.text,
      updated_at = excluded.updated_at
  `).bind(note.id, note.customerId, note.author, note.text, note.createdAt, note.updatedAt).run();
  return note;
}

export async function capacityForDate(db, bookingDate, ignoreReservationId = "") {
  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(guests), 0) AS total_guests,
      COALESCE(SUM(CASE WHEN seating_type = 'table' THEN guests ELSE 0 END), 0) AS table_guests,
      COALESCE(SUM(CASE WHEN seating_type = 'barstand' THEN guests ELSE 0 END), 0) AS barstand_guests
    FROM reservations
    WHERE booking_date = ?
      AND id != ?
      AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
  `).bind(bookingDate, ignoreReservationId || "").first();
  const used = {
    total: Number(row?.total_guests || 0),
    table: Number(row?.table_guests || 0),
    barstand: Number(row?.barstand_guests || 0)
  };
  return {
    booking_date: bookingDate,
    limits: LIMITS,
    used,
    remaining: {
      total: Math.max(0, LIMITS.total - used.total),
      table: Math.max(0, LIMITS.table - used.table),
      barstand: Math.max(0, LIMITS.barstand - used.barstand)
    }
  };
}

export async function validateReservationCapacity(db, reservation, ignoreReservationId = "") {
  const issues = [];
  if (!reservation.customerId) issues.push("customer_id is required.");
  if (!reservation.date) issues.push("booking_date is required.");
  if (!Number.isInteger(reservation.guests) || reservation.guests < 1) issues.push("guests must be a positive integer.");
  if (!["table", "barstand"].includes(reservation.seatingType)) issues.push("seating_type must be table or barstand.");
  if (issues.length || !countsForCapacity(reservation.status)) {
    return { ok: issues.length === 0, issues, availability: reservation.date ? await capacityForDate(db, reservation.date, ignoreReservationId) : null };
  }

  const availability = await capacityForDate(db, reservation.date, ignoreReservationId);
  const nextTotal = availability.used.total + reservation.guests;
  const nextTable = availability.used.table + (reservation.seatingType === "table" ? reservation.guests : 0);
  const nextBarstand = availability.used.barstand + (reservation.seatingType === "barstand" ? reservation.guests : 0);

  if (nextTotal > LIMITS.total) issues.push(`24 total guests exceeded for ${reservation.date}.`);
  if (nextTable > LIMITS.table) issues.push(`12 table guests exceeded for ${reservation.date}.`);
  if (nextBarstand > LIMITS.barstand) issues.push(`12 barstand guests exceeded for ${reservation.date}.`);

  return { ok: issues.length === 0, issues, availability };
}

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
    const parsed = parseJson(value, null);
    if (Array.isArray(parsed)) {
      return parsed;
    }
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
  return db;
}

export async function ensureBookingsSchema(db) {
  return db;
}

function splitName(payload, existing = {}) {
  const sourceName = String(
    payload.full_name
    || payload.fullName
    || payload.name
    || existing.full_name
    || existing.fullName
    || existing.name
    || ""
  ).trim();
  const firstFromName = sourceName.split(/\s+/)[0] || "";
  const lastFromName = sourceName.split(/\s+/).slice(1).join(" ");
  const firstName = String(payload.first_name || payload.firstName || existing.first_name || existing.firstName || firstFromName || "").trim();
  const lastName = String(payload.last_name || payload.lastName || existing.last_name || existing.lastName || lastFromName || "").trim();
  const fullName = String(sourceName || `${firstName} ${lastName}`.trim() || "Website guest").trim();
  return { firstName, lastName, fullName };
}

function normalizeResources(payload, existing = {}) {
  const value = payload.resources ?? existing.resources ?? null;
  const parsed = typeof value === "string" ? parseJson(value, {}) : (value || {});
  return {
    tables: asArray(parsed.tables ?? parsed.assignedTables ?? payload.assignedTables ?? existing.assignedTables ?? []),
    barSeats: asArray(parsed.barSeats ?? parsed.assignedBarSeats ?? payload.assignedBarSeats ?? existing.assignedBarSeats ?? [])
  };
}

export function clientFromPayload(payload, existing = {}) {
  const timestamp = nowIso();
  const name = splitName(payload, existing);
  const phoneFull = String(payload.phone_full || payload.phoneFull || payload.phone || existing.phone_full || existing.phoneFull || existing.phone || "").trim();
  const phoneCountryCode = String(payload.phone_country_code || payload.phoneCountryCode || existing.phone_country_code || existing.phoneCountryCode || "").trim();
  const phoneLocal = String(payload.phone_local || payload.phoneLocal || existing.phone_local || existing.phoneLocal || phoneFull.replace(/[^\d]/g, "")).trim();
  return {
    id: String(payload.id || existing.id || uid("c")),
    firstName: name.firstName,
    lastName: name.lastName,
    fullName: name.fullName,
    email: String(payload.email ?? existing.email ?? "").trim(),
    phoneCountryIso: String(payload.phone_country_iso || payload.phoneCountryIso || existing.phone_country_iso || existing.phoneCountryIso || "").trim(),
    phoneCountryCode,
    phoneLocal,
    phoneFull,
    tags: asArray(payload.tags ?? existing.tags ?? []),
    profileNote: String(payload.profile_note ?? payload.profileNote ?? existing.profile_note ?? existing.profileNote ?? "").trim(),
    createdAt: existing.createdAt || existing.created_at || payload.createdAt || payload.created_at || timestamp,
    updatedAt: timestamp
  };
}

export function bookingFromPayload(payload, existing = {}) {
  const timestamp = nowIso();
  const seatingType = String(payload.seating_type || payload.seatingType || existing.seating_type || existing.seatingType || "table").trim();
  const resources = normalizeResources(payload, existing);
  return {
    id: String(payload.id || existing.id || uid("r")),
    clientId: String(payload.client_id || payload.clientId || existing.client_id || existing.clientId || ""),
    date: normalizeDate(payload.booking_date || payload.date || existing.booking_date || existing.date),
    time: normalizeArrivalTime(payload.booking_time || payload.time || existing.booking_time || existing.time),
    guests: Number(payload.guests ?? existing.guests ?? 1),
    seatingType: seatingType === "barstand" ? "barstand" : "table",
    status: normalizeStatus(payload.status || existing.status || "confirmed"),
    source: String(payload.source || existing.source || "admin"),
    requests: String(payload.requests ?? existing.requests ?? ""),
    internalNote: String(payload.internal_note ?? payload.internalNote ?? existing.internal_note ?? existing.internalNote ?? ""),
    resources,
    createdAt: existing.createdAt || existing.created_at || payload.createdAt || payload.created_at || timestamp,
    updatedAt: timestamp
  };
}

export function noteFromPayload(payload, existing = {}) {
  const timestamp = nowIso();
  return {
    id: String(payload.id || existing.id || uid("n")),
    clientId: String(payload.client_id || payload.clientId || existing.client_id || existing.clientId || ""),
    author: String(payload.author || existing.author || "Admin"),
    text: String(payload.text ?? existing.text ?? "").trim(),
    createdAt: existing.createdAt || existing.created_at || payload.createdAt || payload.created_at || timestamp
  };
}

export function rowToClient(row) {
  const tags = asArray(row.tags);
  const fullName = row.full_name || `${row.first_name || ""} ${row.last_name || ""}`.trim();
  return {
    id: row.id,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    fullName,
    name: fullName,
    email: row.email || "",
    phoneCountryIso: row.phone_country_iso || "",
    phoneCountryCode: row.phone_country_code || "",
    phoneLocal: row.phone_local || "",
    phoneFull: row.phone_full || "",
    phone: row.phone_full || "",
    tags,
    profileNote: row.profile_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    full_name: fullName,
    phone_country_iso: row.phone_country_iso || "",
    phone_country_code: row.phone_country_code || "",
    phone_local: row.phone_local || "",
    phone_full: row.phone_full || "",
    profile_note: row.profile_note || ""
  };
}

export function rowToBooking(row) {
  const resources = normalizeResources({ resources: row.resources });
  return {
    id: row.id,
    clientId: row.client_id,
    date: row.booking_date,
    time: row.booking_time,
    durationMinutes: 0,
    guests: Number(row.guests || 0),
    seatingType: row.seating_type,
    assignedTables: resources.tables,
    assignedBarSeats: resources.barSeats,
    status: row.status,
    server: "Admin",
    source: row.source,
    requests: row.requests,
    internalNote: row.internal_note,
    resources,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client_id: row.client_id,
    booking_date: row.booking_date,
    booking_time: row.booking_time,
    seating_type: row.seating_type,
    internal_note: row.internal_note
  };
}

export function rowToNote(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    client_id: row.client_id,
    author: row.author,
    text: row.text,
    createdAt: row.created_at,
    created_at: row.created_at
  };
}

export async function findClientByContact(db, email, phoneFull) {
  const cleanEmail = String(email || "").trim();
  const cleanPhone = String(phoneFull || "").trim();
  if (cleanEmail) {
    const row = await db.prepare("SELECT * FROM clients WHERE lower(email) = lower(?) LIMIT 1").bind(cleanEmail).first();
    if (row) return rowToClient(row);
  }
  if (cleanPhone) {
    const row = await db.prepare("SELECT * FROM clients WHERE phone_full = ? LIMIT 1").bind(cleanPhone).first();
    if (row) return rowToClient(row);
  }
  return null;
}

export async function getClientById(db, id) {
  const row = await db.prepare("SELECT * FROM clients WHERE id = ? LIMIT 1").bind(id).first();
  return row ? rowToClient(row) : null;
}

export async function getBookingById(db, id) {
  const row = await db.prepare("SELECT * FROM bookings WHERE id = ? LIMIT 1").bind(id).first();
  return row ? rowToBooking(row) : null;
}

export async function upsertClient(db, client) {
  await db.prepare(`
    INSERT INTO clients (
      id,
      first_name,
      last_name,
      full_name,
      email,
      phone_country_iso,
      phone_country_code,
      phone_local,
      phone_full,
      tags,
      profile_note,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      full_name = excluded.full_name,
      email = excluded.email,
      phone_country_iso = excluded.phone_country_iso,
      phone_country_code = excluded.phone_country_code,
      phone_local = excluded.phone_local,
      phone_full = excluded.phone_full,
      tags = excluded.tags,
      profile_note = excluded.profile_note,
      updated_at = excluded.updated_at
  `).bind(
    client.id,
    client.firstName,
    client.lastName,
    client.fullName,
    client.email,
    client.phoneCountryIso,
    client.phoneCountryCode,
    client.phoneLocal,
    client.phoneFull,
    JSON.stringify(client.tags || []),
    client.profileNote || "",
    client.createdAt,
    client.updatedAt
  ).run();
  return client;
}

export async function upsertBooking(db, booking) {
  await db.prepare(`
    INSERT INTO bookings (
      id,
      client_id,
      booking_date,
      booking_time,
      guests,
      seating_type,
      status,
      source,
      requests,
      internal_note,
      resources,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_id = excluded.client_id,
      booking_date = excluded.booking_date,
      booking_time = excluded.booking_time,
      guests = excluded.guests,
      seating_type = excluded.seating_type,
      status = excluded.status,
      source = excluded.source,
      requests = excluded.requests,
      internal_note = excluded.internal_note,
      resources = excluded.resources,
      updated_at = excluded.updated_at
  `).bind(
    booking.id,
    booking.clientId,
    booking.date,
    booking.time,
    booking.guests,
    booking.seatingType,
    booking.status,
    booking.source,
    booking.requests,
    booking.internalNote,
    JSON.stringify(booking.resources || { tables: [], barSeats: [] }),
    booking.createdAt,
    booking.updatedAt
  ).run();
  return booking;
}

export async function upsertNote(db, note) {
  await db.prepare(`
    INSERT INTO client_notes (
      id,
      client_id,
      author,
      text,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_id = excluded.client_id,
      author = excluded.author,
      text = excluded.text
  `).bind(note.id, note.clientId, note.author, note.text, note.createdAt).run();
  return note;
}

export async function capacityForDate(db, bookingDate, ignoreBookingId = "") {
  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(guests), 0) AS total_guests,
      COALESCE(SUM(CASE WHEN seating_type = 'table' THEN guests ELSE 0 END), 0) AS table_guests,
      COALESCE(SUM(CASE WHEN seating_type = 'barstand' THEN guests ELSE 0 END), 0) AS barstand_guests
    FROM bookings
    WHERE booking_date = ?
      AND id != ?
      AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
  `).bind(bookingDate, ignoreBookingId || "").first();
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

export async function validateBookingCapacity(db, booking, ignoreBookingId = "") {
  const issues = [];
  if (!booking.clientId) issues.push("client_id is required.");
  if (!booking.date) issues.push("booking_date is required.");
  if (!Number.isInteger(booking.guests) || booking.guests < 1) issues.push("guests must be a positive integer.");
  if (!["table", "barstand"].includes(booking.seatingType)) issues.push("seating_type must be table or barstand.");
  if (issues.length || !countsForCapacity(booking.status)) {
    return { ok: issues.length === 0, issues, availability: booking.date ? await capacityForDate(db, booking.date, ignoreBookingId) : null };
  }

  const availability = await capacityForDate(db, booking.date, ignoreBookingId);
  const nextTotal = availability.used.total + booking.guests;
  const nextTable = availability.used.table + (booking.seatingType === "table" ? booking.guests : 0);
  const nextBarstand = availability.used.barstand + (booking.seatingType === "barstand" ? booking.guests : 0);

  if (nextTotal > LIMITS.total) issues.push(`24 total guests exceeded for ${booking.date}.`);
  if (nextTable > LIMITS.table) issues.push(`12 table guests exceeded for ${booking.date}.`);
  if (nextBarstand > LIMITS.barstand) issues.push(`12 barstand guests exceeded for ${booking.date}.`);

  return { ok: issues.length === 0, issues, availability };
}

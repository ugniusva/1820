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

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePhoneFull(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  return raw
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");
}

export function normalizeFullName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeNewsletter(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return Number(fallback) === 1 ? 1 : 0;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized) ? 1 : 0;
}

function hasOwnValue(payload, keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
}

export function termsAccepted(payload) {
  return normalizeNewsletter(payload.tos_accepted ?? payload.tosAccepted, 0) === 1;
}

export async function ensureClientsSchema(db) {
  return db;
}

export async function ensureBookingsSchema(db) {
  return db;
}

function splitName(payload, existing = {}) {
  const sourceName = normalizeFullName(
    payload.full_name
    || payload.fullName
    || payload.name
    || existing.full_name
    || existing.fullName
    || existing.name
    || ""
  );
  const firstFromName = sourceName.split(/\s+/)[0] || "";
  const lastFromName = sourceName.split(/\s+/).slice(1).join(" ");
  const firstName = normalizeFullName(payload.first_name || payload.firstName || existing.first_name || existing.firstName || firstFromName || "");
  const lastName = normalizeFullName(payload.last_name || payload.lastName || existing.last_name || existing.lastName || lastFromName || "");
  const fullName = normalizeFullName(sourceName || `${firstName} ${lastName}` || "Website guest");
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
  const phoneFull = normalizePhoneFull(payload.phone_full || payload.phoneFull || payload.phone || existing.phone_full || existing.phoneFull || existing.phone || "");
  const phoneCountryCode = String(payload.phone_country_code || payload.phoneCountryCode || existing.phone_country_code || existing.phoneCountryCode || "").trim();
  const phoneLocal = String(payload.phone_local || payload.phoneLocal || existing.phone_local || existing.phoneLocal || phoneFull.replace(/[^\d]/g, "")).trim();
  const newsletterProvided = hasOwnValue(payload, ["newsletter"]);
  return {
    id: String(payload.id || existing.id || uid("c")),
    firstName: name.firstName,
    lastName: name.lastName,
    fullName: name.fullName,
    email: normalizeEmail(payload.email ?? existing.email ?? ""),
    phoneCountryIso: String(payload.phone_country_iso || payload.phoneCountryIso || existing.phone_country_iso || existing.phoneCountryIso || "").trim(),
    phoneCountryCode,
    phoneLocal,
    phoneFull,
    tags: asArray(payload.tags ?? existing.tags ?? []),
    profileNote: String(payload.profile_note ?? payload.profileNote ?? existing.profile_note ?? existing.profileNote ?? "").trim(),
    newsletter: normalizeNewsletter(newsletterProvided ? payload.newsletter : undefined, existing.newsletter ?? 0),
    newsletterProvided,
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

export function waitlistFromPayload(payload, existing = {}) {
  const timestamp = nowIso();
  const seatingType = String(payload.seating_type || payload.seatingType || existing.seating_type || existing.seatingType || "table").trim();
  return {
    id: String(payload.id || existing.id || uid("w")),
    clientId: String(payload.client_id || payload.clientId || existing.client_id || existing.clientId || ""),
    date: normalizeDate(payload.booking_date || payload.date || existing.booking_date || existing.date),
    preferredTime: normalizeArrivalTime(payload.preferred_time || payload.preferredTime || payload.booking_time || payload.time || existing.preferred_time || existing.preferredTime || "19:00"),
    guests: Number(payload.guests ?? existing.guests ?? 1),
    seatingType: seatingType === "barstand" ? "barstand" : "table",
    requests: String(payload.requests ?? existing.requests ?? ""),
    status: normalizeStatus(payload.status || existing.status || "waiting", "waiting"),
    source: String(payload.source || existing.source || "website"),
    createdAt: existing.createdAt || existing.created_at || payload.createdAt || payload.created_at || timestamp,
    updatedAt: timestamp
  };
}

export function rowToClient(row) {
  const tags = asArray(row.tags);
  const fullName = normalizeFullName(row.full_name || `${row.first_name || ""} ${row.last_name || ""}`);
  return {
    id: row.id,
    firstName: normalizeFullName(row.first_name || ""),
    lastName: normalizeFullName(row.last_name || ""),
    fullName,
    name: fullName,
    email: normalizeEmail(row.email || ""),
    phoneCountryIso: row.phone_country_iso || "",
    phoneCountryCode: row.phone_country_code || "",
    phoneLocal: row.phone_local || "",
    phoneFull: normalizePhoneFull(row.phone_full || ""),
    phone: normalizePhoneFull(row.phone_full || ""),
    tags,
    profileNote: row.profile_note || "",
    newsletter: normalizeNewsletter(row.newsletter, 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    first_name: normalizeFullName(row.first_name || ""),
    last_name: normalizeFullName(row.last_name || ""),
    full_name: fullName,
    phone_country_iso: row.phone_country_iso || "",
    phone_country_code: row.phone_country_code || "",
    phone_local: row.phone_local || "",
    phone_full: normalizePhoneFull(row.phone_full || ""),
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

export function rowToWaitlist(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    client_id: row.client_id,
    date: row.booking_date,
    booking_date: row.booking_date,
    preferredTime: row.preferred_time,
    preferred_time: row.preferred_time,
    time: row.preferred_time,
    guests: Number(row.guests || 0),
    seatingType: row.seating_type,
    seating_type: row.seating_type,
    requests: row.requests || "",
    status: row.status || "waiting",
    source: row.source || "website",
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at
  };
}

const PHONE_MATCH_SQL = `
  replace(
    replace(
      replace(
        replace(
          replace(trim(COALESCE(phone_full, '')), ' ', ''),
          '-',
          ''
        ),
        '(',
        ''
      ),
      ')',
      ''
    ),
    '.',
    ''
  )
`;

export async function findClientByPhoneFull(db, phoneFull) {
  const cleanPhone = normalizePhoneFull(phoneFull);
  if (!cleanPhone) {
    return null;
  }

  const row = await db.prepare(`
    SELECT * FROM clients
    WHERE ${PHONE_MATCH_SQL} = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(cleanPhone).first();
  return row ? rowToClient(row) : null;
}

export async function findClientByEmail(db, email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) {
    return null;
  }

  const row = await db.prepare(`
    SELECT * FROM clients
    WHERE lower(trim(COALESCE(email, ''))) = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(cleanEmail).first();
  return row ? rowToClient(row) : null;
}

export async function findClientsByFullName(db, fullName) {
  const cleanName = normalizeFullName(fullName);
  if (!cleanName) {
    return [];
  }

  const rows = await db.prepare(`
    SELECT * FROM clients
    WHERE lower(trim(COALESCE(full_name, ''))) = lower(?)
    ORDER BY updated_at DESC
    LIMIT 10
  `).bind(cleanName).all();
  return (rows.results || []).map(rowToClient);
}

export async function findClientByContact(db, email, phoneFull) {
  return await findClientByPhoneFull(db, phoneFull) || await findClientByEmail(db, email);
}

function mergeExistingClientForReservation(existing, incoming) {
  const timestamp = nowIso();
  const existingEmail = normalizeEmail(existing.email);
  const incomingEmail = normalizeEmail(incoming.email);
  const existingPhone = normalizePhoneFull(existing.phoneFull || existing.phone_full);
  const incomingPhone = normalizePhoneFull(incoming.phoneFull || incoming.phone_full);
  const existingName = normalizeFullName(existing.fullName || existing.full_name);
  const incomingName = normalizeFullName(incoming.fullName || incoming.full_name);
  const fullName = existingName || incomingName || "Website guest";
  const firstName = normalizeFullName(existing.firstName || existing.first_name || incoming.firstName || incoming.first_name || fullName.split(/\s+/)[0] || "");
  const lastName = normalizeFullName(existing.lastName || existing.last_name || incoming.lastName || incoming.last_name || fullName.split(/\s+/).slice(1).join(" "));

  return {
    ...existing,
    id: existing.id,
    firstName,
    lastName,
    fullName,
    email: existingEmail || incomingEmail,
    phoneCountryIso: existing.phoneCountryIso || existing.phone_country_iso || incoming.phoneCountryIso || incoming.phone_country_iso || "",
    phoneCountryCode: existing.phoneCountryCode || existing.phone_country_code || incoming.phoneCountryCode || incoming.phone_country_code || "",
    phoneLocal: existing.phoneLocal || existing.phone_local || incoming.phoneLocal || incoming.phone_local || "",
    phoneFull: existingPhone || incomingPhone,
    tags: asArray(existing.tags),
    profileNote: existing.profileNote || existing.profile_note || "",
    newsletter: incoming.newsletterProvided ? incoming.newsletter : normalizeNewsletter(existing.newsletter, 0),
    newsletterProvided: incoming.newsletterProvided,
    createdAt: existing.createdAt || existing.created_at || incoming.createdAt || incoming.created_at || timestamp,
    updatedAt: timestamp
  };
}

export async function resolveClientForReservation(db, payload) {
  const incoming = clientFromPayload(payload);
  let client = null;
  let matchType = "new";

  client = await findClientByPhoneFull(db, incoming.phoneFull);
  if (client) {
    matchType = "phone_full";
  }

  if (!client) {
    client = await findClientByEmail(db, incoming.email);
    if (client) {
      matchType = "email";
    }
  }

  if (client) {
    return {
      client: mergeExistingClientForReservation(client, incoming),
      matchType,
      possibleDuplicate: false
    };
  }

  const possibleDuplicates = await findClientsByFullName(db, incoming.fullName);
  return {
    client: incoming,
    matchType,
    possibleDuplicate: possibleDuplicates.length > 0
  };
}

export async function getClientById(db, id) {
  const row = await db.prepare("SELECT * FROM clients WHERE id = ? LIMIT 1").bind(id).first();
  return row ? rowToClient(row) : null;
}

export async function getBookingById(db, id) {
  const row = await db.prepare("SELECT * FROM bookings WHERE id = ? LIMIT 1").bind(id).first();
  return row ? rowToBooking(row) : null;
}

export async function getWaitlistById(db, id) {
  const row = await db.prepare("SELECT * FROM waitlist WHERE id = ? LIMIT 1").bind(id).first();
  return row ? rowToWaitlist(row) : null;
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
      newsletter,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      newsletter = excluded.newsletter,
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
    normalizeNewsletter(client.newsletter, 0),
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

export async function upsertWaitlist(db, waitlist) {
  await db.prepare(`
    INSERT INTO waitlist (
      id,
      client_id,
      booking_date,
      preferred_time,
      guests,
      seating_type,
      requests,
      status,
      source,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      client_id = excluded.client_id,
      booking_date = excluded.booking_date,
      preferred_time = excluded.preferred_time,
      guests = excluded.guests,
      seating_type = excluded.seating_type,
      requests = excluded.requests,
      status = excluded.status,
      source = excluded.source,
      updated_at = excluded.updated_at
  `).bind(
    waitlist.id,
    waitlist.clientId,
    waitlist.date,
    waitlist.preferredTime,
    waitlist.guests,
    waitlist.seatingType,
    waitlist.requests,
    waitlist.status,
    waitlist.source,
    waitlist.createdAt,
    waitlist.updatedAt
  ).run();
  return waitlist;
}

export async function updateWaitlistStatus(db, id, status) {
  const updatedAt = nowIso();
  await db.prepare("UPDATE waitlist SET status = ?, updated_at = ? WHERE id = ?").bind(normalizeStatus(status, "waiting"), updatedAt, id).run();
  const item = await getWaitlistById(db, id);
  return item;
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

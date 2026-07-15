import {
  error,
  getClientById,
  json,
  normalizeEmail,
  normalizePhoneFull,
  readBody,
  requireBinding
} from "../_lib/d1.js";
import { hashCancellationToken, isCancellationToken } from "../_lib/cancellation.js";

const INVALID_LINK_MESSAGE = "This cancellation link is invalid or has expired.";
const BLOCKED_STATUSES = new Set(["cancelled", "completed", "no_show"]);
const MAX_REASON_LENGTH = 500;
const MAX_CONTACT_LENGTH = 320;
const MAX_USER_AGENT_LENGTH = 500;

function safeSummary(row) {
  return {
    booking_date: row.booking_date,
    booking_time: row.booking_time,
    guests: Number(row.guests || 0),
    seating_type: row.seating_type,
    status: row.status
  };
}

async function findBookingByToken(db, token, includeClientId = false) {
  if (!isCancellationToken(token)) {
    return null;
  }
  const tokenHash = await hashCancellationToken(token);
  const columns = includeClientId
    ? "client_id, booking_date, booking_time, guests, seating_type, status"
    : "booking_date, booking_time, guests, seating_type, status";
  const row = await db.prepare(`
    SELECT ${columns}
    FROM bookings
    WHERE cancel_token_hash = ?
    LIMIT 1
  `).bind(tokenHash).first();
  return row ? { row, tokenHash } : null;
}

function normalizeContact(value) {
  return String(value || "").trim().slice(0, MAX_CONTACT_LENGTH);
}

function contactMatches(client, contact) {
  if (!client || !contact) {
    return false;
  }
  if (contact.includes("@")) {
    return normalizeEmail(contact) === normalizeEmail(client.email);
  }
  const suppliedPhone = normalizePhoneFull(contact);
  return Boolean(suppliedPhone) && suppliedPhone === normalizePhoneFull(client.phoneFull || client.phone_full);
}

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    const url = new URL(context.request.url);
    const token = url.searchParams.get("token") || "";
    const match = await findBookingByToken(db, token);
    if (!match) {
      return error(INVALID_LINK_MESSAGE, 404);
    }
    return json({ ok: true, booking: safeSummary(match.row) });
  } catch (cause) {
    return error("Cancellation details could not be loaded.", 500);
  }
}

export async function onRequestPost(context) {
  try {
    const bookingsDb = requireBinding(context, "BOOKINGS_DB");
    const clientsDb = requireBinding(context, "CLIENTS_DB");
    let payload;
    try {
      payload = await readBody(context);
    } catch (cause) {
      return error("Expected a valid JSON request body.", 400);
    }
    const token = String(payload.token || "");

    if (!isCancellationToken(token)) {
      return error(INVALID_LINK_MESSAGE, 404);
    }

    if (payload.confirmed !== true) {
      return error("Cancellation confirmation is required.", 400, { field: "confirmed" });
    }

    const reason = String(payload.cancel_reason || "").trim();
    if (reason.length > MAX_REASON_LENGTH) {
      return error(`Cancellation reason must be ${MAX_REASON_LENGTH} characters or fewer.`, 400, {
        field: "cancel_reason"
      });
    }

    const contact = normalizeContact(payload.contact || payload.email || payload.phone_full || payload.phone);
    if (!contact) {
      return error("Enter the reservation email or phone number.", 400, { field: "contact" });
    }

    const match = await findBookingByToken(bookingsDb, token, true);
    if (!match) {
      return error(INVALID_LINK_MESSAGE, 404);
    }

    const client = await getClientById(clientsDb, match.row.client_id);
    if (!contactMatches(client, contact)) {
      return error("The cancellation details could not be verified.", 403);
    }

    const currentStatus = String(match.row.status || "").toLowerCase();
    if (BLOCKED_STATUSES.has(currentStatus)) {
      return error("This reservation can no longer be cancelled online.", 409, {
        status: currentStatus
      });
    }

    const requestHeaders = context.request.headers;
    const cancelIp = String(requestHeaders.get("CF-Connecting-IP") || "").slice(0, 64);
    const cancelUserAgent = String(requestHeaders.get("User-Agent") || "").slice(0, MAX_USER_AGENT_LENGTH);
    const result = await bookingsDb.prepare(`
      UPDATE bookings
      SET
        status = 'cancelled',
        cancelled_at = CURRENT_TIMESTAMP,
        cancel_reason = ?,
        cancel_source = 'customer',
        cancel_ip = ?,
        cancel_user_agent = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE cancel_token_hash = ?
        AND status NOT IN ('cancelled', 'completed', 'no_show')
    `).bind(reason || null, cancelIp || null, cancelUserAgent || null, match.tokenHash).run();

    const changes = Number(result.meta?.changes ?? result.changes ?? 0);
    if (changes !== 1) {
      return error("This reservation can no longer be cancelled online.", 409);
    }

    return json({
      ok: true,
      message: "Your reservation has been cancelled.",
      booking: {
        ...safeSummary(match.row),
        status: "cancelled"
      }
    });
  } catch (cause) {
    return error("The reservation could not be cancelled.", 500);
  }
}

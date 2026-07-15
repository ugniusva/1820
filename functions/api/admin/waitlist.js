import {
  bookingFromPayload,
  capacityForDate,
  ensureBookingsSchema,
  error,
  getBookingById,
  getWaitlistById,
  json,
  readBody,
  requireBinding,
  rowToWaitlist,
  uid,
  updateWaitlistStatus,
  upsertBooking,
  upsertWaitlist,
  validateBookingCapacity,
  waitlistFromPayload
} from "../../_lib/d1.js";
import { cancellationPath, createCancellationSecret } from "../../_lib/cancellation.js";

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    await ensureBookingsSchema(db);

    const url = new URL(context.request.url);
    const bookingDate = url.searchParams.get("booking_date") || url.searchParams.get("date");
    const status = url.searchParams.get("status");
    const clientId = url.searchParams.get("client_id") || url.searchParams.get("clientId");

    const filters = [];
    const values = [];
    if (bookingDate) {
      filters.push("booking_date = ?");
      values.push(bookingDate);
    }
    if (status && status !== "all") {
      filters.push("status = ?");
      values.push(status);
    }
    if (clientId) {
      filters.push("client_id = ?");
      values.push(clientId);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const statement = db.prepare(`
      SELECT * FROM waitlist
      ${where}
      ORDER BY booking_date ASC, preferred_time ASC, created_at ASC
    `);
    const rows = values.length ? await statement.bind(...values).all() : await statement.all();
    const waitlist = (rows.results || []).map(rowToWaitlist);

    return json({ ok: true, waitlist });
  } catch (cause) {
    return error(cause.message || "Waitlist list failed.", 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    await ensureBookingsSchema(db);

    const payload = await readBody(context);
    const waitlist = waitlistFromPayload(payload);
    if (!waitlist.clientId) return error("client_id is required.", 400);
    if (!waitlist.date) return error("booking_date is required.", 400);

    await upsertWaitlist(db, waitlist);
    return json({ ok: true, waitlist }, { status: 201 });
  } catch (cause) {
    return error(cause.message || "Waitlist save failed.", 500);
  }
}

export async function onRequestPut(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    await ensureBookingsSchema(db);

    const url = new URL(context.request.url);
    const payload = await readBody(context);
    const id = payload.id || url.searchParams.get("id");
    if (!id) return error("id is required.", 400);

    const action = String(payload.action || "").trim().toLowerCase();
    const existing = await getWaitlistById(db, id);
    if (!existing) return error("Waitlist entry not found.", 404);

    if (action === "convert") {
      const booking = bookingFromPayload({
        id: payload.booking_id || uid("r"),
        client_id: existing.clientId,
        booking_date: existing.date,
        booking_time: payload.booking_time || existing.preferredTime,
        guests: existing.guests,
        seating_type: existing.seatingType,
        status: "confirmed",
        source: "admin",
        requests: existing.requests,
        internal_note: `Converted from waitlist ${existing.id}.`,
        resources: payload.resources || { tables: [], barSeats: [] }
      });
      const capacity = await validateBookingCapacity(db, booking, booking.id);
      if (!capacity.ok) {
        return error("Reservation capacity exceeded.", 409, {
          issues: capacity.issues,
          availability: capacity.availability
        });
      }

      if (await getBookingById(db, booking.id)) {
        return error("A reservation with that id already exists.", 409);
      }

      const cancellation = await createCancellationSecret();
      await upsertBooking(db, booking, {
        cancelTokenHash: cancellation.tokenHash
      });
      const waitlist = await updateWaitlistStatus(db, existing.id, "converted");
      const availability = await capacityForDate(db, booking.date);
      return json({
        ok: true,
        waitlist,
        reservation: booking,
        booking,
        cancellation_url: cancellationPath(cancellation.token),
        cancellationUrl: cancellationPath(cancellation.token),
        availability
      });
    }

    const waitlist = waitlistFromPayload({ ...payload, id }, existing);
    await upsertWaitlist(db, waitlist);
    return json({ ok: true, waitlist });
  } catch (cause) {
    return error(cause.message || "Waitlist update failed.", 500);
  }
}

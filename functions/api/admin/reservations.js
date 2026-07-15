import {
  bookingFromPayload,
  cancelBookingAsAdmin,
  capacityForDate,
  ensureBookingsSchema,
  error,
  getBookingById,
  json,
  readBody,
  requireBinding,
  rowToBooking,
  upsertBooking,
  validateBookingCapacity
} from "../../_lib/d1.js";
import { cancellationPath, createCancellationSecret } from "../../_lib/cancellation.js";

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    await ensureBookingsSchema(db);

    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const booking = await getBookingById(db, id);
      if (!booking) return error("Reservation not found.", 404);
      return json({ ok: true, reservation: booking, booking });
    }

    const bookingDate = url.searchParams.get("booking_date") || url.searchParams.get("date");
    const status = url.searchParams.get("status");
    const clientId = url.searchParams.get("client_id") || url.searchParams.get("clientId");
    const search = String(url.searchParams.get("search") || "").trim().toLowerCase();

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
    if (search) {
      filters.push("(lower(requests) LIKE ? OR lower(internal_note) LIKE ? OR lower(source) LIKE ? OR lower(resources) LIKE ?)");
      values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const statement = db.prepare(`
      SELECT * FROM bookings
      ${where}
      ORDER BY booking_date DESC, booking_time ASC, created_at DESC
    `);
    const rows = values.length ? await statement.bind(...values).all() : await statement.all();
    const bookings = (rows.results || []).map(rowToBooking);

    return json({
      ok: true,
      reservations: bookings,
      bookings
    });
  } catch (cause) {
    return error(cause.message || "Reservation list failed.", 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    await ensureBookingsSchema(db);

    const payload = await readBody(context);
    const booking = bookingFromPayload(payload);
    if (await getBookingById(db, booking.id)) {
      return error("A reservation with that id already exists.", 409);
    }
    const capacity = await validateBookingCapacity(db, booking, booking.id);
    if (!capacity.ok) {
      return error("Reservation capacity exceeded.", 409, {
        issues: capacity.issues,
        availability: capacity.availability
      });
    }

    const cancellation = await createCancellationSecret();
    await upsertBooking(db, booking, {
      cancelTokenHash: cancellation.tokenHash
    });
    const availability = await capacityForDate(db, booking.date);
    return json({
      ok: true,
      reservation: booking,
      booking,
      cancellation_url: cancellationPath(cancellation.token),
      cancellationUrl: cancellationPath(cancellation.token),
      availability
    }, { status: 201 });
  } catch (cause) {
    return error(cause.message || "Reservation save failed.", 500);
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

    const existing = await getBookingById(db, id);
    if (!existing) return error("Reservation not found.", 404);

    const booking = bookingFromPayload({ ...payload, id }, existing);
    if (booking.status === "cancelled" && existing.status !== "cancelled") {
      const changes = await cancelBookingAsAdmin(db, id);
      if (changes !== 1) {
        return error("Reservation could not be cancelled.", 409);
      }
      const cancelledBooking = await getBookingById(db, id);
      const availability = await capacityForDate(db, booking.date);
      return json({
        ok: true,
        reservation: cancelledBooking,
        booking: cancelledBooking,
        availability
      });
    }

    const capacity = await validateBookingCapacity(db, booking, booking.id);
    if (!capacity.ok) {
      return error("Reservation capacity exceeded.", 409, {
        issues: capacity.issues,
        availability: capacity.availability
      });
    }

    await upsertBooking(db, booking);
    const availability = await capacityForDate(db, booking.date);
    return json({ ok: true, reservation: booking, booking, availability });
  } catch (cause) {
    return error(cause.message || "Reservation update failed.", 500);
  }
}

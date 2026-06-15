import {
  capacityForDate,
  ensureBookingsSchema,
  error,
  getReservationById,
  json,
  readBody,
  requireBinding,
  reservationFromPayload,
  rowToReservation,
  upsertReservation,
  validateReservationCapacity
} from "../../_lib/d1.js";

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    await ensureBookingsSchema(db);

    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const reservation = await getReservationById(db, id);
      if (!reservation) return error("Reservation not found.", 404);
      return json({ ok: true, reservation });
    }

    const bookingDate = url.searchParams.get("booking_date") || url.searchParams.get("date");
    const status = url.searchParams.get("status");
    const customerId = url.searchParams.get("customer_id") || url.searchParams.get("customerId");
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
    if (customerId) {
      filters.push("customer_id = ?");
      values.push(customerId);
    }
    if (search) {
      filters.push("(lower(requests) LIKE ? OR lower(internal_note) LIKE ? OR lower(source) LIKE ? OR lower(server) LIKE ?)");
      values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const statement = db.prepare(`
      SELECT * FROM reservations
      ${where}
      ORDER BY booking_date DESC, booking_time ASC, created_at DESC
    `);
    const rows = values.length ? await statement.bind(...values).all() : await statement.all();

    return json({
      ok: true,
      reservations: (rows.results || []).map(rowToReservation)
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
    const reservation = reservationFromPayload(payload);
    const capacity = await validateReservationCapacity(db, reservation, reservation.id);
    if (!capacity.ok) {
      return error("Reservation capacity exceeded.", 409, {
        issues: capacity.issues,
        availability: capacity.availability
      });
    }

    await upsertReservation(db, reservation);
    const availability = await capacityForDate(db, reservation.date);
    return json({ ok: true, reservation, availability }, { status: 201 });
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

    const existing = await getReservationById(db, id);
    if (!existing) return error("Reservation not found.", 404);

    const reservation = reservationFromPayload({ ...payload, id }, existing);
    const capacity = await validateReservationCapacity(db, reservation, reservation.id);
    if (!capacity.ok) {
      return error("Reservation capacity exceeded.", 409, {
        issues: capacity.issues,
        availability: capacity.availability
      });
    }

    await upsertReservation(db, reservation);
    const availability = await capacityForDate(db, reservation.date);
    return json({ ok: true, reservation, availability });
  } catch (cause) {
    return error(cause.message || "Reservation update failed.", 500);
  }
}

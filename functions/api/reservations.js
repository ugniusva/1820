import {
  bookingFromPayload,
  capacityForDate,
  clientFromPayload,
  ensureBookingsSchema,
  ensureClientsSchema,
  error,
  findClientByContact,
  getBookingById,
  json,
  readBody,
  requireBinding,
  uid,
  upsertBooking,
  upsertClient,
  validateBookingCapacity
} from "../_lib/d1.js";

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    await ensureBookingsSchema(db);

    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    const bookingDate = url.searchParams.get("booking_date") || url.searchParams.get("date");

    if (id) {
      const booking = await getBookingById(db, id);
      if (!booking) return error("Reservation not found.", 404);
      return json({ ok: true, reservation: booking, booking });
    }

    if (bookingDate) {
      const availability = await capacityForDate(db, bookingDate);
      return json({ ok: true, availability });
    }

    return error("Provide id or booking_date.", 400);
  } catch (cause) {
    return error(cause.message || "Reservation lookup failed.", 500);
  }
}

export async function onRequestPost(context) {
  try {
    const clientsDb = requireBinding(context, "CLIENTS_DB");
    const bookingsDb = requireBinding(context, "BOOKINGS_DB");
    await ensureClientsSchema(clientsDb);
    await ensureBookingsSchema(bookingsDb);

    const payload = await readBody(context);
    const publicPayload = {
      ...payload,
      source: payload.source || "website",
      status: "confirmed"
    };

    let client = await findClientByContact(clientsDb, payload.email, payload.phone_full || payload.phone);
    client = clientFromPayload(payload, client || {});

    const bookingDraft = bookingFromPayload({
      ...publicPayload,
      id: payload.id || uid("r"),
      client_id: client.id
    });

    const capacity = await validateBookingCapacity(bookingsDb, bookingDraft, bookingDraft.id);
    if (!capacity.ok) {
      return error("Reservation capacity exceeded.", 409, {
        issues: capacity.issues,
        availability: capacity.availability
      });
    }

    await upsertClient(clientsDb, client);
    await upsertBooking(bookingsDb, bookingDraft);

    const availability = await capacityForDate(bookingsDb, bookingDraft.date);
    return json({ ok: true, client, reservation: bookingDraft, booking: bookingDraft, availability }, { status: 201 });
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

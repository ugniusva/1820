import {
  capacityForDate,
  customerFromPayload,
  ensureBookingsSchema,
  ensureClientsSchema,
  error,
  findCustomerByContact,
  getReservationById,
  json,
  readBody,
  requireBinding,
  reservationFromPayload,
  uid,
  upsertCustomer,
  upsertReservation,
  validateReservationCapacity
} from "../_lib/d1.js";

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    await ensureBookingsSchema(db);

    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    const bookingDate = url.searchParams.get("booking_date") || url.searchParams.get("date");

    if (id) {
      const reservation = await getReservationById(db, id);
      if (!reservation) return error("Reservation not found.", 404);
      return json({ ok: true, reservation });
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

    const marker = [
      payload.email || "",
      payload.booking_date || payload.date || "",
      payload.booking_time || payload.time || "",
      payload.created_at || ""
    ].join("|");

    let customer = await findCustomerByContact(clientsDb, payload.email, payload.phone);
    customer = customerFromPayload(payload, customer || {});

    const reservationDraft = reservationFromPayload({
      ...publicPayload,
      id: payload.id || uid("r"),
      customerId: customer.id,
      publicMarker: marker
    });

    const capacity = await validateReservationCapacity(bookingsDb, reservationDraft, reservationDraft.id);
    if (!capacity.ok) {
      return error("Reservation capacity exceeded.", 409, {
        issues: capacity.issues,
        availability: capacity.availability
      });
    }

    await upsertCustomer(clientsDb, customer);

    const reservation = reservationDraft;
    await upsertReservation(bookingsDb, reservation);

    const availability = await capacityForDate(bookingsDb, reservation.date);
    return json({ ok: true, customer, reservation, availability }, { status: 201 });
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

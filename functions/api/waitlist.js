import {
  capacityForDate,
  ensureBookingsSchema,
  ensureClientsSchema,
  error,
  json,
  readBody,
  requireBinding,
  resolveClientForReservation,
  termsAccepted,
  upsertClient,
  upsertWaitlist,
  waitlistFromPayload
} from "../_lib/d1.js";

export async function onRequestPost(context) {
  try {
    const clientsDb = requireBinding(context, "CLIENTS_DB");
    const bookingsDb = requireBinding(context, "BOOKINGS_DB");
    await ensureClientsSchema(clientsDb);
    await ensureBookingsSchema(bookingsDb);

    const payload = await readBody(context);
    if (!termsAccepted(payload)) {
      return error("Terms of Service must be accepted before joining the waitlist.", 400, {
        field: "tos_accepted"
      });
    }

    const clientResolution = await resolveClientForReservation(clientsDb, payload);
    const client = clientResolution.client;
    const waitlist = waitlistFromPayload({
      ...payload,
      client_id: client.id,
      status: "waiting",
      source: payload.source || "website"
    });

    if (!waitlist.clientId) return error("client_id is required.", 400);
    if (!waitlist.date) return error("booking_date is required.", 400);
    if (!Number.isInteger(waitlist.guests) || waitlist.guests < 1) return error("guests must be a positive integer.", 400);
    if (!["table", "barstand"].includes(waitlist.seatingType)) return error("seating_type must be table or barstand.", 400);

    await upsertClient(clientsDb, client);
    await upsertWaitlist(bookingsDb, waitlist);

    const availability = await capacityForDate(bookingsDb, waitlist.date);
    return json({
      ok: true,
      client,
      waitlist,
      availability,
      client_match: clientResolution.matchType,
      possible_duplicate: clientResolution.possibleDuplicate,
      possibleDuplicate: clientResolution.possibleDuplicate
    }, { status: 201 });
  } catch (cause) {
    return error(cause.message || "Waitlist save failed.", 500);
  }
}

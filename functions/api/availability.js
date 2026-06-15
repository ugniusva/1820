import {
  capacityForDate,
  ensureBookingsSchema,
  error,
  json,
  normalizeDate,
  requireBinding
} from "../_lib/d1.js";

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "BOOKINGS_DB");
    await ensureBookingsSchema(db);

    const url = new URL(context.request.url);
    const bookingDate = normalizeDate(url.searchParams.get("booking_date") || url.searchParams.get("date"));
    if (!bookingDate) {
      return error("booking_date is required.", 400);
    }

    const availability = await capacityForDate(db, bookingDate);
    return json({ ok: true, availability });
  } catch (cause) {
    return error(cause.message || "Availability failed.", 500);
  }
}

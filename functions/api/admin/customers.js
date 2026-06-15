import {
  customerFromPayload,
  ensureClientsSchema,
  error,
  getCustomerById,
  json,
  readBody,
  requireBinding,
  rowToCustomer,
  upsertCustomer
} from "../../_lib/d1.js";

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "CLIENTS_DB");
    await ensureClientsSchema(db);

    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const customer = await getCustomerById(db, id);
      if (!customer) return error("Customer not found.", 404);
      return json({ ok: true, customer });
    }

    const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
    const rows = search
      ? await db.prepare(`
          SELECT * FROM customers
          WHERE lower(name) LIKE ?
             OR lower(email) LIKE ?
             OR lower(phone) LIKE ?
             OR lower(profile_note) LIKE ?
             OR lower(tags_json) LIKE ?
          ORDER BY updated_at DESC, name ASC
        `).bind(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`).all()
      : await db.prepare("SELECT * FROM customers ORDER BY updated_at DESC, name ASC").all();

    return json({
      ok: true,
      customers: (rows.results || []).map(rowToCustomer)
    });
  } catch (cause) {
    return error(cause.message || "Customer list failed.", 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireBinding(context, "CLIENTS_DB");
    await ensureClientsSchema(db);

    const payload = await readBody(context);
    const customer = customerFromPayload(payload);
    if (!customer.name) return error("name is required.", 400);

    await upsertCustomer(db, customer);
    return json({ ok: true, customer }, { status: 201 });
  } catch (cause) {
    return error(cause.message || "Customer save failed.", 500);
  }
}

export async function onRequestPut(context) {
  try {
    const db = requireBinding(context, "CLIENTS_DB");
    await ensureClientsSchema(db);

    const url = new URL(context.request.url);
    const payload = await readBody(context);
    const id = payload.id || url.searchParams.get("id");
    if (!id) return error("id is required.", 400);

    const existing = await getCustomerById(db, id);
    if (!existing) return error("Customer not found.", 404);

    const customer = customerFromPayload({ ...payload, id }, existing);
    if (!customer.name) return error("name is required.", 400);

    await upsertCustomer(db, customer);
    return json({ ok: true, customer });
  } catch (cause) {
    return error(cause.message || "Customer update failed.", 500);
  }
}

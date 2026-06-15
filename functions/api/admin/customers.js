import {
  clientFromPayload,
  ensureClientsSchema,
  error,
  getClientById,
  json,
  readBody,
  requireBinding,
  rowToClient,
  upsertClient
} from "../../_lib/d1.js";

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "CLIENTS_DB");
    await ensureClientsSchema(db);

    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const client = await getClientById(db, id);
      if (!client) return error("Client not found.", 404);
      return json({ ok: true, client });
    }

    const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
    const rows = search
      ? await db.prepare(`
          SELECT * FROM clients
          WHERE lower(full_name) LIKE ?
             OR lower(first_name) LIKE ?
             OR lower(last_name) LIKE ?
             OR lower(email) LIKE ?
             OR lower(phone_full) LIKE ?
             OR lower(profile_note) LIKE ?
             OR lower(tags) LIKE ?
          ORDER BY updated_at DESC, full_name ASC
        `).bind(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`).all()
      : await db.prepare("SELECT * FROM clients ORDER BY updated_at DESC, full_name ASC").all();

    const clients = (rows.results || []).map(rowToClient);
    return json({
      ok: true,
      clients
    });
  } catch (cause) {
    return error(cause.message || "Client list failed.", 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireBinding(context, "CLIENTS_DB");
    await ensureClientsSchema(db);

    const payload = await readBody(context);
    const client = clientFromPayload(payload);
    if (!client.fullName) return error("full_name is required.", 400);

    await upsertClient(db, client);
    return json({ ok: true, client }, { status: 201 });
  } catch (cause) {
    return error(cause.message || "Client save failed.", 500);
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

    const existing = await getClientById(db, id);
    if (!existing) return error("Client not found.", 404);

    const client = clientFromPayload({ ...payload, id }, existing);
    if (!client.fullName) return error("full_name is required.", 400);

    await upsertClient(db, client);
    return json({ ok: true, client });
  } catch (cause) {
    return error(cause.message || "Client update failed.", 500);
  }
}

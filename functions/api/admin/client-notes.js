import {
  ensureClientsSchema,
  error,
  json,
  noteFromPayload,
  readBody,
  requireBinding,
  rowToNote,
  upsertNote
} from "../../_lib/d1.js";

async function getNoteById(db, id) {
  const row = await db.prepare("SELECT * FROM client_notes WHERE id = ? LIMIT 1").bind(id).first();
  return row ? rowToNote(row) : null;
}

export async function onRequestGet(context) {
  try {
    const db = requireBinding(context, "CLIENTS_DB");
    await ensureClientsSchema(db);

    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const note = await getNoteById(db, id);
      if (!note) return error("Client note not found.", 404);
      return json({ ok: true, note });
    }

    const clientId = url.searchParams.get("client_id") || url.searchParams.get("clientId");
    const rows = clientId
      ? await db.prepare("SELECT * FROM client_notes WHERE client_id = ? ORDER BY created_at DESC").bind(clientId).all()
      : await db.prepare("SELECT * FROM client_notes ORDER BY created_at DESC").all();

    return json({
      ok: true,
      notes: (rows.results || []).map(rowToNote)
    });
  } catch (cause) {
    return error(cause.message || "Client note list failed.", 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = requireBinding(context, "CLIENTS_DB");
    await ensureClientsSchema(db);

    const payload = await readBody(context);
    const note = noteFromPayload(payload);
    if (!note.clientId) return error("client_id is required.", 400);
    if (!note.text) return error("text is required.", 400);

    await upsertNote(db, note);
    return json({ ok: true, note }, { status: 201 });
  } catch (cause) {
    return error(cause.message || "Client note save failed.", 500);
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

    const existing = await getNoteById(db, id);
    if (!existing) return error("Client note not found.", 404);

    const note = noteFromPayload({ ...payload, id }, existing);
    if (!note.clientId) return error("client_id is required.", 400);
    if (!note.text) return error("text is required.", 400);

    await upsertNote(db, note);
    return json({ ok: true, note });
  } catch (cause) {
    return error(cause.message || "Client note update failed.", 500);
  }
}

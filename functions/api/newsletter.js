import {
  clientFromPayload,
  ensureClientsSchema,
  error,
  findClientByEmail,
  findClientsByFullName,
  json,
  normalizeEmail,
  normalizeFullName,
  normalizeNewsletter,
  readBody,
  requireBinding,
  upsertClient
} from "../_lib/d1.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost(context) {
  try {
    const db = requireBinding(context, "CLIENTS_DB");
    await ensureClientsSchema(db);

    let payload;
    try {
      payload = await readBody(context);
    } catch (cause) {
      return error("Expected a JSON request body.", 400);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return error("Expected a JSON request body.", 400);
    }

    const fullName = normalizeFullName(
      payload.full_name || payload.fullName || payload.name
    );
    const email = normalizeEmail(payload.email);

    if (!fullName) {
      return error("Name is required.", 400, { field: "full_name" });
    }
    if (fullName.length > 160) {
      return error("Name is too long.", 400, { field: "full_name" });
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return error("A valid email is required.", 400, { field: "email" });
    }

    const existing = await findClientByEmail(db, email);
    const possibleDuplicates = existing
      ? []
      : await findClientsByFullName(db, fullName);
    const nameParts = fullName.split(/\s+/);
    const client = clientFromPayload({
      ...payload,
      id: existing?.id,
      first_name: nameParts[0] || "",
      last_name: nameParts.slice(1).join(" "),
      full_name: fullName,
      email,
      newsletter: normalizeNewsletter(payload.newsletter, 0)
    }, existing || {});

    await upsertClient(db, client);

    return json({
      ok: true,
      created: !existing,
      possible_duplicate: possibleDuplicates.length > 0,
      profile: {
        full_name: client.fullName,
        email: client.email,
        newsletter: client.newsletter
      }
    }, { status: existing ? 200 : 201 });
  } catch (cause) {
    return error("Unable to save profile.", 500);
  }
}

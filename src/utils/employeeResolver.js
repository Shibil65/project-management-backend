/**
 * employeeResolver.js
 * --------------------
 * Single source of truth for resolving an employee's document from the
 * tenant-specific database.
 *
 * Architecture context:
 *   - System Catalog DB  : global user store; `_id` used to sign JWTs.
 *   - Tenant DB          : company_<companyId>; isolated copy of user data.
 *
 * The two databases can have divergent `_id` values for pre-existing records
 * that were created before the `_id` sync fix was applied. This resolver
 * handles all three resolution strategies:
 *   1. findById(userId)           — fast path, works for synced records.
 *   2. findOne({ email })         — fallback for mismatched _id records.
 *   3. Self-heal: delete old doc, recreate with correct _id — permanent fix.
 *
 * All controllers should use this helper instead of inline lookup logic.
 */

/**
 * Resolves the employee User document from the tenant DB.
 *
 * @param {string} companyId  - Company identifier (used for logging only).
 * @param {string} userId     - The _id from the JWT (system catalog _id).
 * @param {string} email      - The email from the JWT (used as fallback key).
 * @param {Model}  UserModel  - The Mongoose model bound to the tenant DB.
 * @param {object} [opts]
 * @param {boolean} [opts.select]  - If false, skip field filtering (default includes all).
 *
 * @returns {Promise<{ employeeUser: object|null, resolved: 'byId'|'byEmail'|'healed'|null }>}
 */
async function resolveEmployeeUser(companyId, userId, email, UserModel, opts = {}) {
  // ── 1. Fast path: lookup by ID ──────────────────────────────────────────
  let employeeUser = await UserModel.findById(userId);
  if (employeeUser) {
    return { employeeUser, resolved: 'byId' };
  }

  // ── 2. Email fallback ────────────────────────────────────────────────────
  if (!email) {
    console.warn(`[RESOLVER] No email in token for userId=${userId}; cannot fall back.`);
    return { employeeUser: null, resolved: null };
  }

  employeeUser = await UserModel.findOne({ email: email.toLowerCase() });

  if (!employeeUser) {
    console.warn(`[RESOLVER] Employee not found in tenant DB for companyId=${companyId}, email=${email}`);
    return { employeeUser: null, resolved: null };
  }

  const oldId = String(employeeUser._id);
  const newId = String(userId);

  if (oldId === newId) {
    // IDs match — no mismatch, just return.
    return { employeeUser, resolved: 'byEmail' };
  }

  // ── 3. Self-heal: IDs differ — permanently fix the tenant document ───────
  console.warn(
    `[ID MISMATCH] Employee ${email} in company_${companyId}: ` +
    `tenant _id=${oldId} ≠ system _id=${newId}. Attempting self-heal.`
  );

  try {
    // Copy all fields, replace _id with the correct system catalog value.
    const { _id: _discarded, __v, ...userData } = employeeUser.toObject();

    await UserModel.deleteOne({ _id: oldId });

    const fixedUser = new UserModel({ ...userData, _id: userId });
    await fixedUser.save();

    employeeUser = await UserModel.findById(userId);
    console.log(`[ID SYNC] Permanently fixed tenant _id for ${email}: ${oldId} → ${newId}`);

    return { employeeUser, resolved: 'healed' };
  } catch (healErr) {
    console.error(`[ID SYNC ERROR] Could not fix _id for ${email}:`, healErr.message);

    // Healing failed — re-fetch the email-based record as a non-blocking fallback.
    employeeUser = await UserModel.findOne({ email: email.toLowerCase() });
    return { employeeUser, resolved: 'byEmail' };
  }
}

module.exports = { resolveEmployeeUser };

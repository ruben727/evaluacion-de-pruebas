'use strict';

const { query } = require('./pool');

/**
 * Acceso a datos de la tabla users. Nunca devuelve password_hash salvo que se pida explícitamente.
 */
const PUBLIC_COLUMNS = 'id, name, email, created_at, updated_at';

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findAll() {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY id ASC`);
  return rows.map(toPublic);
}

async function findById(id) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return toPublic(rows[0]);
}

async function findByEmail(email, { withPassword = false } = {}) {
  const columns = withPassword ? `${PUBLIC_COLUMNS}, password_hash` : PUBLIC_COLUMNS;
  const { rows } = await query(`SELECT ${columns} FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
  if (!rows[0]) return null;
  return withPassword ? rows[0] : toPublic(rows[0]);
}

async function create({ name, email, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, passwordHash],
  );
  return toPublic(rows[0]);
}

async function update(id, { name, email, passwordHash }) {
  const { rows } = await query(
    `UPDATE users
        SET name = COALESCE($2, name),
            email = COALESCE($3, email),
            password_hash = COALESCE($4, password_hash),
            updated_at = NOW()
      WHERE id = $1
      RETURNING ${PUBLIC_COLUMNS}`,
    [id, name ?? null, email ?? null, passwordHash ?? null],
  );
  return toPublic(rows[0]);
}

async function remove(id) {
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { toPublic, findAll, findById, findByEmail, create, update, remove };

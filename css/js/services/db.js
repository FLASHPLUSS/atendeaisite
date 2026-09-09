import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), '..', '..', '..');

export async function loadEnv() {
  try {
    const content = await fs.readFile(path.join(projectRoot, '.env'), 'utf8');
    content.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    });
  } catch {
    // Variáveis também podem vir do ambiente do EasyPanel.
  }
}

await loadEnv();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada no arquivo .env.');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      logo_data TEXT,
      snacks_menu_image TEXT,
      drinks_menu_image TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS snacks_menu_image TEXT;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS drinks_menu_image TEXT;
    CREATE TABLE IF NOT EXISTS restaurant_settings (
      restaurant_id BIGINT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
      profile JSONB NOT NULL DEFAULT '{}'::jsonb,
      agent JSONB NOT NULL DEFAULT '{}'::jsonb,
      printer JSONB NOT NULL DEFAULT '{}'::jsonb,
      theme TEXT NOT NULL DEFAULT 'dark',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS printer JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE TABLE IF NOT EXISTS menu_items (
      id BIGSERIAL PRIMARY KEY,
      restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'Pratos principais',
      image_data TEXT,
      available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS menu_items_restaurant_idx ON menu_items (restaurant_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS print_jobs (
      id BIGSERIAL PRIMARY KEY,
      restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      order_number TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'printed', 'failed')),
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      printed_at TIMESTAMPTZ
    );
    ALTER TABLE print_jobs DROP CONSTRAINT IF EXISTS print_jobs_status_check;
    ALTER TABLE print_jobs ADD CONSTRAINT print_jobs_status_check CHECK (status IN ('pending', 'printing', 'printed', 'failed', 'cancelled'));
    CREATE INDEX IF NOT EXISTS print_jobs_queue_idx ON print_jobs (restaurant_id, status, created_at);
  `);
}

export async function getRestaurant() {
  const result = await pool.query('SELECT * FROM restaurants ORDER BY id LIMIT 1');
  if (result.rows[0]) return result.rows[0];
  const created = await pool.query('INSERT INTO restaurants (name) VALUES ($1) RETURNING *', ['Meu restaurante']);
  await pool.query('INSERT INTO restaurant_settings (restaurant_id) VALUES ($1) ON CONFLICT DO NOTHING', [created.rows[0].id]);
  return created.rows[0];
}

export async function listMenu() {
  const restaurant = await getRestaurant();
  const result = await pool.query('SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY updated_at DESC, id DESC', [restaurant.id]);
  return { restaurant, items: result.rows };
}

export async function updateSettings(payload) {
  const restaurant = await getRestaurant();
  const { name, phone, address, logoData, profile, agent, printer, theme } = payload;
  const updated = await pool.query(
    'UPDATE restaurants SET name = COALESCE($1, name), phone = COALESCE($2, phone), address = COALESCE($3, address), logo_data = COALESCE($4, logo_data), updated_at = NOW() WHERE id = $5 RETURNING *',
    [name, phone, address, logoData, restaurant.id],
  );
  await pool.query(
    `INSERT INTO restaurant_settings (restaurant_id, profile, agent, printer, theme, updated_at) VALUES ($1, $2, $3, $4, COALESCE($5, 'dark'), NOW())
     ON CONFLICT (restaurant_id) DO UPDATE SET profile = COALESCE($2, restaurant_settings.profile), agent = COALESCE($3, restaurant_settings.agent), printer = COALESCE($4, restaurant_settings.printer), theme = COALESCE($5, restaurant_settings.theme), updated_at = NOW()`,
    [restaurant.id, profile || {}, agent || {}, printer || {}, theme || null],
  );
  return updated.rows[0];
}

export async function createMenuItem(payload) {
  const restaurant = await getRestaurant();
  const result = await pool.query(
    'INSERT INTO menu_items (restaurant_id, name, description, price, category, image_data, available) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [restaurant.id, payload.name, payload.description || '', Number(payload.price || 0), payload.category || 'Pratos principais', payload.imageData || null, payload.available !== false],
  );
  return result.rows[0];
}

export async function updateMenuItem(id, payload) {
  const restaurant = await getRestaurant();
  const result = await pool.query(
    `UPDATE menu_items SET name = COALESCE($1, name), description = COALESCE($2, description), price = COALESCE($3, price), category = COALESCE($4, category), image_data = COALESCE($5, image_data), available = COALESCE($6, available), updated_at = NOW() WHERE id = $7 AND restaurant_id = $8 RETURNING *`,
    [payload.name, payload.description, payload.price == null ? null : Number(payload.price), payload.category, payload.imageData, payload.available, id, restaurant.id],
  );
  return result.rows[0] || null;
}

export async function deleteMenuItem(id) {
  const restaurant = await getRestaurant();
  const result = await pool.query('DELETE FROM menu_items WHERE id = $1 AND restaurant_id = $2 RETURNING *', [id, restaurant.id]);
  return result.rows[0] || null;
}

export async function getPhysicalMenu() {
  const restaurant = await getRestaurant();
  return {
    snacksMenuImage: restaurant.snacks_menu_image,
    drinksMenuImage: restaurant.drinks_menu_image,
    updatedAt: restaurant.updated_at,
  };
}

export async function savePhysicalMenu(payload) {
  const restaurant = await getRestaurant();
  const result = await pool.query(
    `UPDATE restaurants SET snacks_menu_image = $1, drinks_menu_image = $2, updated_at = NOW()
     WHERE id = $3 RETURNING snacks_menu_image, drinks_menu_image, updated_at`,
    [payload.snacksMenuImage || null, payload.drinksMenuImage || null, restaurant.id],
  );
  return {
    snacksMenuImage: result.rows[0].snacks_menu_image,
    drinksMenuImage: result.rows[0].drinks_menu_image,
    updatedAt: result.rows[0].updated_at,
  };
}

export async function createPrintJob(payload) {
  const restaurant = await getRestaurant();
  const result = await pool.query(
    'INSERT INTO print_jobs (restaurant_id, order_number, payload) VALUES ($1, $2, $3) RETURNING *',
    [restaurant.id, String(payload.orderNumber || `TESTE-${Date.now()}`), payload.order || payload],
  );
  return result.rows[0];
}

export async function listPendingPrintJobs() {
  const restaurant = await getRestaurant();
  const result = await pool.query(
    `UPDATE print_jobs SET status = 'printing'
     WHERE id IN (SELECT id FROM print_jobs WHERE restaurant_id = $1 AND status = 'pending' ORDER BY created_at LIMIT 10)
     RETURNING *`,
    [restaurant.id],
  );
  return result.rows;
}

export async function updatePrintJob(id, payload) {
  const restaurant = await getRestaurant();
  const result = await pool.query(
    `UPDATE print_jobs SET status = $1, error_message = $2, printed_at = CASE WHEN $1 = 'printed' THEN NOW() ELSE printed_at END
     WHERE id = $3 AND restaurant_id = $4 RETURNING *`,
    [payload.status, payload.errorMessage || null, id, restaurant.id],
  );
  return result.rows[0] || null;
}

export async function deletePrintJob(id) {
  const restaurant = await getRestaurant();
  const result = await pool.query('DELETE FROM print_jobs WHERE id = $1 AND restaurant_id = $2 RETURNING id', [id, restaurant.id]);
  return result.rows[0] || null;
}

export async function listOrders() {
  const restaurant = await getRestaurant();
  const result = await pool.query(
    `SELECT id, order_number, payload, status, error_message, created_at, printed_at
     FROM print_jobs WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [restaurant.id],
  );
  return result.rows;
}
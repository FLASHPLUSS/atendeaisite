import { loadEnv, migrate, pool } from './db.js';

try {
  await loadEnv();
  await migrate();
  console.log('Banco de dados AtendeAI atualizado.');
} finally {
  await pool.end();
}
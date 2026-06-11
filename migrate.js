'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db/db');

async function runMigrations() {
  console.log('🔄 Iniciando migración de base de datos...');
  try {
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    await pool.query(sql);
    console.log('✅ Migración completada con éxito. Las tablas están listas.');
  } catch (err) {
    console.error('❌ Error durante la migración:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();

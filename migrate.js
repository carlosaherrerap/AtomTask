const { pool } = require('./db/db');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting migration to create project_permissions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_permissions (
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        can_view BOOLEAN DEFAULT TRUE,
        can_edit BOOLEAN DEFAULT FALSE,
        can_delete BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (project_id, email)
      );
    `);
    console.log('project_permissions table created successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();

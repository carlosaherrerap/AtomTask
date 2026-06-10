'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { requireAuthApi } = require('../middleware/auth');

// ─── CONTACTS CRUD ───────────────────────────────────────────────────────────
router.get('/contacts', requireAuthApi, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM contacts WHERE created_by = $1 ORDER BY name ASC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching contacts:', err);
    res.status(500).json({ error: 'Error al obtener contactos' });
  }
});

router.post('/contacts', requireAuthApi, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Nombre y correo son requeridos' });
    }
    const result = await db.query(`
      INSERT INTO contacts (name, email, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (created_by, email) DO UPDATE SET name = $1
      RETURNING *
    `, [name, email.trim().toLowerCase(), req.user.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating contact:', err);
    res.status(500).json({ error: 'Error al crear contacto' });
  }
});

router.delete('/contacts/:id', requireAuthApi, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM contacts WHERE id = $1 AND created_by = $2', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting contact:', err);
    res.status(500).json({ error: 'Error al eliminar contacto' });
  }
});

// ─── CONTACT GROUPS CRUD ──────────────────────────────────────────────────────
router.get('/groups', requireAuthApi, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        g.id, g.name, g.created_at,
        COALESCE(
          json_agg(
            json_build_object('id', c.id, 'name', c.name, 'email', c.email)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) AS members
      FROM contact_groups g
      LEFT JOIN contact_group_members gm ON g.id = gm.group_id
      LEFT JOIN contacts c ON gm.contact_id = c.id
      WHERE g.created_by = $1
      GROUP BY g.id
      ORDER BY g.name ASC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Error al obtener grupos' });
  }
});

router.post('/groups', requireAuthApi, async (req, res) => {
  const client = await db.getClient();
  try {
    const { name, memberIds } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nombre de grupo es requerido' });
    }

    await client.query('BEGIN');

    const groupResult = await client.query(`
      INSERT INTO contact_groups (name, created_by)
      VALUES ($1, $2)
      ON CONFLICT (created_by, name) DO UPDATE SET name = $1
      RETURNING *
    `, [name, req.user.id]);

    const group = groupResult.rows[0];

    // Delete existing members if group was updated, then insert
    await client.query('DELETE FROM contact_group_members WHERE group_id = $1', [group.id]);

    if (memberIds && Array.isArray(memberIds)) {
      for (const contactId of memberIds) {
        await client.query(
          'INSERT INTO contact_group_members (group_id, contact_id) VALUES ($1, $2)',
          [group.id, contactId]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(group);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Error al crear grupo' });
  } finally {
    client.release();
  }
});

router.delete('/groups/:id', requireAuthApi, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM contact_groups WHERE id = $1 AND created_by = $2', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting group:', err);
    res.status(500).json({ error: 'Error al eliminar grupo' });
  }
});

// ─── DEFAULT VISIBILITY ──────────────────────────────────────────────────────
router.get('/default-visibility', requireAuthApi, async (req, res) => {
  try {
    const result = await db.query('SELECT default_project_visibility FROM users WHERE id = $1', [req.user.id]);
    res.json({ default_visibility: result.rows[0]?.default_project_visibility || 'PUBLIC' });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener visibilidad por defecto' });
  }
});

router.post('/default-visibility', requireAuthApi, async (req, res) => {
  try {
    const { default_visibility } = req.body;
    if (!['PUBLIC', 'PRIVATE'].includes(default_visibility)) {
      return res.status(400).json({ error: 'Visibilidad no válida' });
    }
    await db.query('UPDATE users SET default_project_visibility = $1 WHERE id = $2', [default_visibility, req.user.id]);
    res.json({ success: true, default_visibility });
  } catch (err) {
    res.status(500).json({ error: 'Error al guardar visibilidad por defecto' });
  }
});

// ─── PROJECT RULES ───────────────────────────────────────────────────────────
router.get('/rules/:projectId', requireAuthApi, async (req, res) => {
  try {
    const { projectId } = req.params;
    // Verificar que el usuario sea creador o tenga acceso
    const projCheck = await db.query('SELECT created_by, visibility FROM projects WHERE id = $1', [projectId]);
    if (projCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const rules = await db.query('SELECT * FROM project_visibility_rules WHERE project_id = $1', [projectId]);
    res.json({
      visibility: projCheck.rows[0].visibility,
      rules: rules.rows
    });
  } catch (err) {
    console.error('Error fetching project rules:', err);
    res.status(500).json({ error: 'Error al obtener reglas de privacidad' });
  }
});

router.post('/rules/:projectId', requireAuthApi, async (req, res) => {
  const client = await db.getClient();
  try {
    const { projectId } = req.params;
    const { visibility, rules } = req.body; // rules: [{ rule_type: 'CONTACT', target_id: '...' }]

    if (!['PUBLIC', 'PRIVATE', 'CONTACTS', 'EXCEPT'].includes(visibility)) {
      return res.status(400).json({ error: 'Tipo de visibilidad no válido' });
    }

    await client.query('BEGIN');

    // Actualizar visibilidad del proyecto
    const projUpdate = await client.query(
      'UPDATE projects SET visibility = $1 WHERE id = $2 AND created_by = $3 RETURNING *',
      [visibility, projectId, req.user.id]
    );

    if (projUpdate.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes permisos para modificar este proyecto' });
    }

    // Limpiar reglas previas
    await client.query('DELETE FROM project_visibility_rules WHERE project_id = $1', [projectId]);

    // Insertar nuevas reglas
    if (rules && Array.isArray(rules)) {
      for (const rule of rules) {
        if (['CONTACT', 'GROUP', 'EXCEPT_CONTACT'].includes(rule.rule_type) && rule.target_id) {
          await client.query(`
            INSERT INTO project_visibility_rules (project_id, rule_type, target_id)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
          `, [projectId, rule.rule_type, rule.target_id]);
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, visibility });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error setting project rules:', err);
    res.status(500).json({ error: 'Error al guardar reglas de privacidad' });
  } finally {
    client.release();
  }
});

module.exports = router;

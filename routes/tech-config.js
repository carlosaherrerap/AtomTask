'use strict';
const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db/db');
const { requireAuthApi } = require('../middleware/auth');

// Helpers for permission checks
async function checkEditPermission(projectId, userId, userEmail) {
  const result = await db.query(`
    SELECT p.created_by, pp.can_edit
    FROM projects p
    LEFT JOIN project_permissions pp ON p.id = pp.project_id AND pp.email = $2
    WHERE p.id = $1
  `, [projectId, userEmail]);
  if (result.rows.length === 0) return false;
  const { created_by, can_edit } = result.rows[0];
  return created_by === userId || !!can_edit;
}

async function checkViewPermission(projectId, userId, userEmail) {
  const result = await db.query(`
    SELECT p.created_by, p.visibility, pp.can_view, pp.can_edit, pp.can_delete
    FROM projects p
    LEFT JOIN project_permissions pp ON p.id = pp.project_id AND pp.email = $2
    WHERE p.id = $1
  `, [projectId, userEmail]);
  if (result.rows.length === 0) return false;
  const { created_by, visibility, can_view, can_edit, can_delete } = result.rows[0];
  
  if (created_by === userId || can_view || can_edit || can_delete) return true;
  if (visibility === 'PUBLIC') return true;
  
  if (visibility === 'CONTACTS') {
    const ruleRes = await db.query(`
      SELECT 1 FROM project_visibility_rules r
      LEFT JOIN contacts c ON r.target_id = c.id AND r.rule_type = 'CONTACT'
      LEFT JOIN contact_groups g ON r.target_id = g.id AND r.rule_type = 'GROUP'
      LEFT JOIN contact_group_members gm ON g.id = gm.group_id
      LEFT JOIN contacts gc ON gm.contact_id = gc.id
      WHERE r.project_id = $1
        AND (c.email = $2 OR gc.email = $2)
    `, [projectId, userEmail]);
    return ruleRes.rows.length > 0;
  }
  
  if (visibility === 'EXCEPT') {
    const ruleRes = await db.query(`
      SELECT 1 FROM project_visibility_rules r
      JOIN contacts c ON r.target_id = c.id AND r.rule_type = 'EXCEPT_CONTACT'
      WHERE r.project_id = $1
        AND c.email = $2
    `, [projectId, userEmail]);
    return ruleRes.rows.length === 0;
  }
  
  return false;
}

// ─── GET /api/projects/:projectId/tech-config ────────────────────────────────
router.get('/', requireAuthApi, async (req, res) => {
  try {
    const { projectId } = req.params;
    const hasViewAccess = await checkViewPermission(projectId, req.user.id, req.user.email);
    if (!hasViewAccess) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }

    const result = await db.query(`
      SELECT tc.*, c.name AS responsible_name, c.email AS responsible_email
      FROM project_tech_config tc
      LEFT JOIN contacts c ON tc.responsible_contact_id = c.id
      WHERE tc.project_id = $1
      ORDER BY tc.created_at ASC
    `, [projectId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tech config:', err);
    res.status(500).json({ error: 'Error al obtener configuración de tecnologías' });
  }
});

// ─── POST /api/projects/:projectId/tech-config ───────────────────────────────
router.post('/', requireAuthApi, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { section, technologies, observation, responsible_contact_id } = req.body;

    if (!section || !technologies || !Array.isArray(technologies)) {
      return res.status(400).json({ error: 'Sección y tecnologías son requeridas' });
    }

    const hasEditAccess = await checkEditPermission(projectId, req.user.id, req.user.email);
    if (!hasEditAccess) {
      return res.status(403).json({ error: 'No tienes permisos de edición en este proyecto' });
    }

    const result = await db.query(`
      INSERT INTO project_tech_config (project_id, section, technologies, observation, responsible_contact_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      projectId,
      section,
      technologies,
      observation || '',
      responsible_contact_id || null
    ]);

    const newConfig = result.rows[0];
    if (newConfig.responsible_contact_id) {
      const contactResult = await db.query('SELECT name, email FROM contacts WHERE id = $1', [newConfig.responsible_contact_id]);
      if (contactResult.rows.length > 0) {
        newConfig.responsible_name = contactResult.rows[0].name;
        newConfig.responsible_email = contactResult.rows[0].email;
      }
    }

    res.status(201).json(newConfig);
  } catch (err) {
    console.error('Error creating tech config:', err);
    res.status(500).json({ error: 'Error al guardar configuración de tecnologías' });
  }
});

// ─── DELETE /api/projects/:projectId/tech-config/:id ──────────────────────────
router.delete('/:id', requireAuthApi, async (req, res) => {
  try {
    const { projectId, id } = req.params;
    
    const hasEditAccess = await checkEditPermission(projectId, req.user.id, req.user.email);
    if (!hasEditAccess) {
      return res.status(403).json({ error: 'No tienes permisos de edición en este proyecto' });
    }

    await db.query('DELETE FROM project_tech_config WHERE id = $1 AND project_id = $2', [id, projectId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting tech config:', err);
    res.status(500).json({ error: 'Error al eliminar configuración' });
  }
});

module.exports = router;

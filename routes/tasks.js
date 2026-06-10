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

// ─── GET /api/projects/:projectId/tasks ───────────────────────────────────────
router.get('/', requireAuthApi, async (req, res) => {
  try {
    const { projectId } = req.params;
    const hasViewAccess = await checkViewPermission(projectId, req.user.id, req.user.email);
    if (!hasViewAccess) {
      return res.status(403).json({ error: 'No tienes acceso a este proyecto' });
    }

    const result = await db.query(`
      SELECT * FROM project_tasks
      WHERE project_id = $1
      ORDER BY section ASC, order_index ASC, created_at ASC
    `, [projectId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

// ─── POST /api/projects/:projectId/tasks ──────────────────────────────────────
router.post('/', requireAuthApi, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { description, order_index, section } = req.body;

    if (!description || description.trim() === '') {
      return res.status(400).json({ error: 'Descripción requerida' });
    }

    const hasEditAccess = await checkEditPermission(projectId, req.user.id, req.user.email);
    if (!hasEditAccess) {
      return res.status(403).json({ error: 'No tienes permisos de edición en este proyecto' });
    }

    // Obtener el siguiente order_index en esta sección
    const countResult = await db.query(
      'SELECT COUNT(*) as cnt FROM project_tasks WHERE project_id = $1 AND section = $2',
      [projectId, section || 'General']
    );
    const nextIndex = parseInt(countResult.rows[0].cnt);

    const result = await db.query(`
      INSERT INTO project_tasks (project_id, section, description, is_checked, order_index)
      VALUES ($1, $2, $3, FALSE, $4)
      RETURNING *
    `, [projectId, section || 'General', description.trim(), order_index !== undefined ? order_index : nextIndex]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
});

// ─── PATCH /api/tasks/:taskId/toggle ─────────────────────────────────────────────────────
router.patch('/:taskId/toggle', requireAuthApi, async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // Check permission via task's project
    const taskRes = await db.query('SELECT project_id FROM project_tasks WHERE id = $1', [taskId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    const projectId = taskRes.rows[0].project_id;
    const hasEditAccess = await checkEditPermission(projectId, req.user.id, req.user.email);
    if (!hasEditAccess) {
      return res.status(403).json({ error: 'No tienes permisos de edición en este proyecto' });
    }

    const result = await db.query(`
      UPDATE project_tasks
      SET is_checked = NOT is_checked
      WHERE id = $1
      RETURNING *
    `, [taskId]);

    // Calcular nuevo progreso del proyecto
    const progressResult = await db.query(`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_checked = TRUE) AS completed
      FROM project_tasks
      WHERE project_id = $1
    `, [projectId]);

    const { total, completed } = progressResult.rows[0];
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    res.json({ task: result.rows[0], progress });
  } catch (err) {
    console.error('Error toggling task:', err);
    res.status(500).json({ error: 'Error al actualizar tarea' });
  }
});

// ─── DELETE /api/tasks/:taskId ─────────────────────────────────────────────────
router.delete('/:taskId', requireAuthApi, async (req, res) => {
  try {
    const { taskId } = req.params;

    // Check permission via task's project
    const taskRes = await db.query('SELECT project_id FROM project_tasks WHERE id = $1', [taskId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    const projectId = taskRes.rows[0].project_id;
    const hasEditAccess = await checkEditPermission(projectId, req.user.id, req.user.email);
    if (!hasEditAccess) {
      return res.status(403).json({ error: 'No tienes permisos de edición en este proyecto' });
    }

    await db.query('DELETE FROM project_tasks WHERE id = $1', [taskId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Error al eliminar tarea' });
  }
});

// ─── PUT /api/tasks/:taskId (editar descripción) ──────────────────────────────
router.put('/:taskId', requireAuthApi, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { description } = req.body;

    // Check permission via task's project
    const taskRes = await db.query('SELECT project_id FROM project_tasks WHERE id = $1', [taskId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    const projectId = taskRes.rows[0].project_id;
    const hasEditAccess = await checkEditPermission(projectId, req.user.id, req.user.email);
    if (!hasEditAccess) {
      return res.status(403).json({ error: 'No tienes permisos de edición en este proyecto' });
    }

    const result = await db.query(`
      UPDATE project_tasks SET description = $1 WHERE id = $2 RETURNING *
    `, [description, taskId]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Error al actualizar tarea' });
  }
});

module.exports = router;

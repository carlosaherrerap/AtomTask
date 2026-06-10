'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { requireAuthApi } = require('../middleware/auth');

// Helper to check if user has edit permission on a project
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

// Helper to check if user has delete permission on a project
async function checkDeletePermission(projectId, userId, userEmail) {
  const result = await db.query(`
    SELECT p.created_by, pp.can_delete
    FROM projects p
    LEFT JOIN project_permissions pp ON p.id = pp.project_id AND pp.email = $2
    WHERE p.id = $1
  `, [projectId, userEmail]);
  if (result.rows.length === 0) return false;
  const { created_by, can_delete } = result.rows[0];
  return created_by === userId || !!can_delete;
}

// ─── GET /api/projects ─────────────────────────────────────────────────────────
router.get('/', requireAuthApi, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        p.id, p.name, p.description, p.type, p.client, p.responsible,
        TO_CHAR(p.delivery_date, 'YYYY-MM-DD') AS delivery_date,
        TO_CHAR(p.start_date, 'YYYY-MM-DD') AS start_date,
        p.importance, p.status, p.visibility, p.created_by, p.created_at, p.updated_at,
        u.name AS created_by_name,
        u.avatar_url AS created_by_avatar,
        (p.created_by = $1 OR COALESCE(pp.can_edit, FALSE) = TRUE) AS user_can_edit,
        (p.created_by = $1 OR COALESCE(pp.can_delete, FALSE) = TRUE) AS user_can_delete,
        COUNT(pt.id) AS total_tasks,
        COUNT(pt.id) FILTER (WHERE pt.is_checked = TRUE) AS completed_tasks
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN project_tasks pt ON p.id = pt.project_id
      LEFT JOIN project_permissions pp ON p.id = pp.project_id AND pp.email = $2
      WHERE p.created_by = $1 
         OR pp.can_view = TRUE OR pp.can_edit = TRUE OR pp.can_delete = TRUE
         OR p.visibility = 'PUBLIC'
         OR (p.visibility = 'CONTACTS' AND EXISTS (
             SELECT 1 FROM project_visibility_rules r
             LEFT JOIN contacts c ON r.target_id = c.id AND r.rule_type = 'CONTACT'
             LEFT JOIN contact_groups g ON r.target_id = g.id AND r.rule_type = 'GROUP'
             LEFT JOIN contact_group_members gm ON g.id = gm.group_id
             LEFT JOIN contacts gc ON gm.contact_id = gc.id
             WHERE r.project_id = p.id
               AND (c.email = $2 OR gc.email = $2)
         ))
         OR (p.visibility = 'EXCEPT' AND NOT EXISTS (
             SELECT 1 FROM project_visibility_rules r
             JOIN contacts c ON r.target_id = c.id AND r.rule_type = 'EXCEPT_CONTACT'
             WHERE r.project_id = p.id
               AND c.email = $2
         ))
      GROUP BY p.id, u.name, u.avatar_url, pp.can_edit, pp.can_delete
      ORDER BY p.created_at DESC
    `, [req.user.id, req.user.email]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Error al obtener proyectos' });
  }
});

// ─── GET /api/projects/:id ─────────────────────────────────────────────────────
router.get('/:id', requireAuthApi, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [projectResult, tasksResult, detailsResult] = await Promise.all([
      db.query(`
        SELECT p.id, p.name, p.description, p.type, p.client, p.responsible,
               TO_CHAR(p.delivery_date, 'YYYY-MM-DD') AS delivery_date,
               TO_CHAR(p.start_date, 'YYYY-MM-DD') AS start_date,
               p.importance, p.status, p.visibility, p.created_by, p.created_at, p.updated_at,
               u.name AS created_by_name, u.avatar_url AS created_by_avatar,
               (p.created_by = $2 OR COALESCE(pp.can_edit, FALSE) = TRUE) AS user_can_edit,
               (p.created_by = $2 OR COALESCE(pp.can_delete, FALSE) = TRUE) AS user_can_delete
        FROM projects p
        LEFT JOIN users u ON p.created_by = u.id
        LEFT JOIN project_permissions pp ON p.id = pp.project_id AND pp.email = $3
        WHERE p.id = $1 AND (
            p.created_by = $2
            OR pp.can_view = TRUE OR pp.can_edit = TRUE OR pp.can_delete = TRUE
            OR p.visibility = 'PUBLIC'
            OR (p.visibility = 'CONTACTS' AND EXISTS (
                SELECT 1 FROM project_visibility_rules r
                LEFT JOIN contacts c ON r.target_id = c.id AND r.rule_type = 'CONTACT'
                LEFT JOIN contact_groups g ON r.target_id = g.id AND r.rule_type = 'GROUP'
                LEFT JOIN contact_group_members gm ON g.id = gm.group_id
                LEFT JOIN contacts gc ON gm.contact_id = gc.id
                WHERE r.project_id = p.id
                  AND (c.email = $3 OR gc.email = $3)
            ))
            OR (p.visibility = 'EXCEPT' AND NOT EXISTS (
                SELECT 1 FROM project_visibility_rules r
                JOIN contacts c ON r.target_id = c.id AND r.rule_type = 'EXCEPT_CONTACT'
                WHERE r.project_id = p.id
                  AND c.email = $3
            ))
        )
      `, [id, req.user.id, req.user.email]),
      db.query(`
        SELECT * FROM project_tasks
        WHERE project_id = $1
        ORDER BY section ASC, order_index ASC, created_at ASC
      `, [id]),
      db.query(`
        SELECT field_key, field_value FROM project_details
        WHERE project_id = $1
      `, [id]),
    ]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado o sin autorización' });
    }

    const project = projectResult.rows[0];
    project.tasks = tasksResult.rows;
    project.details = {};
    detailsResult.rows.forEach(d => {
      project.details[d.field_key] = d.field_value;
    });

    // Calcular avance
    const totalTasks = tasksResult.rows.length;
    const completedTasks = tasksResult.rows.filter(t => t.is_checked).length;
    project.progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    res.json(project);
  } catch (err) {
    console.error('Error fetching project:', err);
    res.status(500).json({ error: 'Error al obtener proyecto' });
  }
});

// ─── POST /api/projects ────────────────────────────────────────────────────────
router.post('/', requireAuthApi, async (req, res) => {
  const client = await db.getClient();
  try {
    const {
      name, description, type, client: projectClient,
      responsible, delivery_date, start_date, importance, status, visibility, details
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Nombre y tipo son requeridos' });
    }

    await client.query('BEGIN');

    // Si no se provee visibilidad, obtener la visibilidad por defecto del usuario
    let dbVisibility = visibility;
    if (!dbVisibility) {
      const userRes = await client.query('SELECT default_project_visibility FROM users WHERE id = $1', [req.user.id]);
      dbVisibility = userRes.rows[0]?.default_project_visibility || 'PUBLIC';
    }

    const projectResult = await client.query(`
      INSERT INTO projects (name, description, type, client, responsible, delivery_date, start_date, importance, status, visibility, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *, TO_CHAR(delivery_date, 'YYYY-MM-DD') AS delivery_date, TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date
    `, [
      name, description, type, projectClient, responsible,
      delivery_date || null, start_date || null, importance || 'BAJO', status || 'SIN INICIAR',
      dbVisibility, req.user.id
    ]);

    const project = projectResult.rows[0];

    // Insertar detalles específicos por tipo
    if (details && typeof details === 'object') {
      for (const [key, value] of Object.entries(details)) {
        if (value !== undefined && value !== '') {
          await client.query(`
            INSERT INTO project_details (project_id, field_key, field_value)
            VALUES ($1, $2, $3)
            ON CONFLICT (project_id, field_key) DO UPDATE SET field_value = $3
          `, [project.id, key, value]);
        }
      }
    }

    await client.query('COMMIT');
    
    project.tasks = [];
    project.details = details || {};
    project.progress = 0;
    project.user_can_edit = true;
    project.user_can_delete = true;

    res.status(201).json(project);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Error al crear proyecto' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/projects/:id ─────────────────────────────────────────────────────
router.put('/:id', requireAuthApi, async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const {
      name, description, type, client: projectClient,
      responsible, delivery_date, start_date, importance, status, visibility, details
    } = req.body;

    const hasEditAccess = await checkEditPermission(id, req.user.id, req.user.email);
    if (!hasEditAccess) {
      return res.status(403).json({ error: 'No tienes permisos de edición en este proyecto' });
    }

    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE projects 
      SET name=$1, description=$2, type=$3, client=$4, responsible=$5,
          delivery_date=$6, start_date=$7, importance=$8, status=$9, visibility=$10, updated_at=NOW()
      WHERE id=$11
      RETURNING *, TO_CHAR(delivery_date, 'YYYY-MM-DD') AS delivery_date, TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date
    `, [
      name, description, type, projectClient, responsible,
      delivery_date || null, start_date || null, importance, status, visibility || 'PUBLIC', id
    ]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    // Actualizar detalles
    if (details && typeof details === 'object') {
      await client.query('DELETE FROM project_details WHERE project_id = $1', [id]);
      for (const [key, value] of Object.entries(details)) {
        if (value !== undefined && value !== '') {
          await client.query(`
            INSERT INTO project_details (project_id, field_key, field_value)
            VALUES ($1, $2, $3)
          `, [id, key, value]);
        }
      }
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'Error al actualizar proyecto' });
  } finally {
    client.release();
  }
});

// ─── DELETE /api/projects/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuthApi, async (req, res) => {
  try {
    const { id } = req.params;
    const hasDeleteAccess = await checkDeletePermission(id, req.user.id, req.user.email);
    if (!hasDeleteAccess) {
      return res.status(403).json({ error: 'No tienes permisos de eliminación en este proyecto' });
    }

    const result = await db.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Error al eliminar proyecto' });
  }
});

// ─── COLLABORATORS PERMISSIONS CRUD ───────────────────────────────────────────

// GET /api/projects/:id/permissions
router.get('/:id/permissions', requireAuthApi, async (req, res) => {
  try {
    const { id } = req.params;
    const proj = await db.query('SELECT created_by FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (proj.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo el creador del proyecto puede ver los permisos' });
    }

    const permissions = await db.query('SELECT * FROM project_permissions WHERE project_id = $1 ORDER BY email ASC', [id]);
    res.json(permissions.rows);
  } catch (err) {
    console.error('Error loading permissions:', err);
    res.status(500).json({ error: 'Error al obtener permisos' });
  }
});

// POST /api/projects/:id/permissions
router.post('/:id/permissions', requireAuthApi, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, can_view, can_edit, can_delete } = req.body;
    if (!email) return res.status(400).json({ error: 'El correo electrónico es requerido' });

    const proj = await db.query('SELECT created_by FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (proj.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo el creador del proyecto puede modificar permisos' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const result = await db.query(`
      INSERT INTO project_permissions (project_id, email, can_view, can_edit, can_delete)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (project_id, email) DO UPDATE SET
        can_view = EXCLUDED.can_view,
        can_edit = EXCLUDED.can_edit,
        can_delete = EXCLUDED.can_delete
      RETURNING *
    `, [id, cleanEmail, can_view !== false, !!can_edit, !!can_delete]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving permissions:', err);
    res.status(500).json({ error: 'Error al guardar permisos' });
  }
});

// DELETE /api/projects/:id/permissions/:email
router.delete('/:id/permissions/:email', requireAuthApi, async (req, res) => {
  try {
    const { id, email } = req.params;
    const proj = await db.query('SELECT created_by FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
    if (proj.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo el creador del proyecto puede eliminar permisos' });
    }

    await db.query('DELETE FROM project_permissions WHERE project_id = $1 AND email = $2', [id, email.trim().toLowerCase()]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting permission:', err);
    res.status(500).json({ error: 'Error al eliminar permiso' });
  }
});

module.exports = router;

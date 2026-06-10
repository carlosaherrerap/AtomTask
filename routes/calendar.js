'use strict';
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const db = require('../db/db');
const { requireAuthApi } = require('../middleware/auth');

// Helper: crear cliente OAuth2 con tokens del usuario
function getOAuth2Client(user) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );
  oauth2Client.setCredentials({
    access_token: user.access_token,
    refresh_token: user.refresh_token,
  });
  return oauth2Client;
}

// ─── GET /api/meetings ─────────────────────────────────────────────────────────
// Devuelve TODAS las reuniones (de todos los usuarios), censurando privadas ajenas
router.get('/', requireAuthApi, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        m.*,
        u.name AS creator_name,
        u.avatar_url AS creator_avatar,
        u.email AS creator_email,
        p.name AS project_name
      FROM meetings m
      LEFT JOIN users u ON m.created_by = u.id
      LEFT JOIN projects p ON m.project_id = p.id
      ORDER BY m.start_time ASC
    `);
    
    const processedMeetings = result.rows.map(m => {
      const isMine = m.created_by === req.user.id;
      if (m.visibility === 'PRIVATE' && !isMine) {
        return {
          id: m.id,
          start_time: m.start_time,
          end_time: m.end_time,
          title: 'Reservado (Privado)',
          description: 'Esta reunión es privada.',
          visibility: m.visibility,
          created_by: m.created_by,
          creator_name: m.creator_name,
          creator_avatar: m.creator_avatar,
          meet_link: null,
          project_id: null,
          project_name: null,
          is_private_for_me: true
        };
      }
      return { ...m, is_private_for_me: false };
    });
    
    res.json(processedMeetings);
  } catch (err) {
    console.error('Error fetching meetings:', err);
    res.status(500).json({ error: 'Error al obtener reuniones' });
  }
});

// ─── GET /api/meetings/availability ───────────────────────────────────────────
router.get('/availability', requireAuthApi, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'Parámetros start y end requeridos' });
    }

    const result = await db.query(`
      SELECT m.start_time, m.end_time, m.title, m.created_by, m.visibility, u.name as creator_name
      FROM meetings m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.start_time >= $1 AND m.end_time <= $2
      ORDER BY m.start_time
    `, [start, end]);

    const availability = result.rows.map(m => {
      const isMine = m.created_by === req.user.id;
      if (m.visibility === 'PRIVATE' && !isMine) {
        return {
          start_time: m.start_time,
          end_time: m.end_time,
          title: 'Reservado (Privado)',
          creator_name: m.creator_name
        };
      }
      return m;
    });

    res.json(availability);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener disponibilidad' });
  }
});

// ─── POST /api/meetings ────────────────────────────────────────────────────────
router.post('/', requireAuthApi, async (req, res) => {
  try {
    const { title, description, start_time, end_time, project_id, attendee_emails, visibility } = req.body;

    if (!title || !start_time || !end_time) {
      return res.status(400).json({ error: 'Título, fecha inicio y fin son requeridos' });
    }

    const dbVisibility = (visibility === 'PRIVATE') ? 'PRIVATE' : 'PUBLIC';
    let meetLink = null;
    let googleEventId = null;

    // Intentar crear evento en Google Calendar con Meet
    if (req.user.access_token) {
      try {
        const auth = getOAuth2Client(req.user);
        const calendar = google.calendar({ version: 'v3', auth });

        const attendees = [];
        if (attendee_emails && Array.isArray(attendee_emails)) {
          attendee_emails.forEach(email => {
            if (email) attendees.push({ email });
          });
        }

        const event = {
          summary: title,
          description: description || '',
          visibility: dbVisibility === 'PRIVATE' ? 'private' : 'public',
          start: {
            dateTime: new Date(start_time).toISOString(),
            timeZone: 'America/Bogota',
          },
          end: {
            dateTime: new Date(end_time).toISOString(),
            timeZone: 'America/Bogota',
          },
          conferenceData: {
            createRequest: {
              requestId: `atomtask-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
          attendees,
        };

        const response = await calendar.events.insert({
          calendarId: 'primary',
          resource: event,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
        });

        googleEventId = response.data.id;
        if (response.data.conferenceData && response.data.conferenceData.entryPoints) {
          const videoEntry = response.data.conferenceData.entryPoints.find(
            ep => ep.entryPointType === 'video'
          );
          if (videoEntry) meetLink = videoEntry.uri;
        }
        if (!meetLink && response.data.hangoutLink) {
          meetLink = response.data.hangoutLink;
        }
      } catch (calErr) {
        console.warn('Google Calendar error (continuando sin Meet link):', calErr.message);
        // Continuar sin link de Meet si falla la API
      }
    }

    // Guardar en DB
    const result = await db.query(`
      INSERT INTO meetings (google_event_id, title, description, start_time, end_time, meet_link, created_by, project_id, visibility)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      googleEventId, title, description || '',
      new Date(start_time), new Date(end_time),
      meetLink, req.user.id,
      project_id || null,
      dbVisibility
    ]);

    const meeting = result.rows[0];
    meeting.creator_name = req.user.name;
    meeting.creator_avatar = req.user.avatar_url;

    res.status(201).json(meeting);
  } catch (err) {
    console.error('Error creating meeting:', err);
    res.status(500).json({ error: 'Error al crear reunión' });
  }
});

// ─── DELETE /api/meetings/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuthApi, async (req, res) => {
  try {
    const { id } = req.params;

    const meetingResult = await db.query(
      'SELECT * FROM meetings WHERE id = $1',
      [id]
    );
    if (meetingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reunión no encontrada' });
    }

    const meeting = meetingResult.rows[0];

    // Eliminar de Google Calendar si existe
    if (meeting.google_event_id && req.user.access_token) {
      try {
        const auth = getOAuth2Client(req.user);
        const calendar = google.calendar({ version: 'v3', auth });
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: meeting.google_event_id,
          sendUpdates: 'all',
        });
      } catch (calErr) {
        console.warn('No se pudo eliminar de Google Calendar:', calErr.message);
      }
    }

    await db.query('DELETE FROM meetings WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting meeting:', err);
    res.status(500).json({ error: 'Error al eliminar reunión' });
  }
});

module.exports = router;

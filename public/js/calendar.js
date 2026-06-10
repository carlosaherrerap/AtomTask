'use strict';

const Calendar = {
  meetings: [],
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  currentUserId: null,
  pollInterval: null,
  selectedDay: null,
  knownMeetingIds: new Set(),
  initializedKnownMeetings: false,

  async init() {
    this.currentUserId = AppState.user?.id;
    const today = new Date();
    this.selectedDay = { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
    this.renderCalendar();
    await this.loadMeetingsBackground();
    await this.loadProjectsForSelect();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  },

  // ─── Cargar reuniones en segundo plano y tracker ───────────
  async loadMeetingsBackground() {
    try {
      this.currentUserId = AppState.user?.id;
      const fetched = await App.apiFetch('/api/meetings');
      this.meetings = fetched;

      if (!this.initializedKnownMeetings) {
        this.knownMeetingIds = new Set(fetched.map(m => m.id));
        this.initializedKnownMeetings = true;
      } else {
        let hasNewPublicMeeting = false;
        for (const m of fetched) {
          if (m.visibility === 'PUBLIC' && m.created_by !== this.currentUserId && !this.knownMeetingIds.has(m.id)) {
            hasNewPublicMeeting = true;
            this.knownMeetingIds.add(m.id);
            App.playChime();
            App.toast(`Nueva reunión pública programada: "${m.title}"`, 'info');
          }
        }
        if (hasNewPublicMeeting) {
          const badge = document.getElementById('calendar-notification-badge');
          if (badge && AppState.currentView !== 'calendar') {
            badge.style.display = 'inline-block';
          }
        }
      }

      this.runTracker();

      if (AppState.currentView === 'calendar') {
        this.renderCalendar();
        this.renderMeetingsList();
        this.renderDayDetail();
      }
    } catch (err) {
      console.error('Error al actualizar reuniones en segundo plano:', err);
    }
  },

  // ─── Cargar reuniones ──────────────────────────────────────
  async loadMeetings() {
    try {
      await this.loadMeetingsBackground();
    } catch (err) {
      const listEl = document.getElementById('meetingsList');
      if (listEl) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon"><i class="bi bi-exclamation-triangle"></i></div>
            <h3>Error al cargar reuniones</h3>
            <p>${App.escapeHtml(err.message)}</p>
          </div>`;
      }
    }
  },

  // ─── Tracker de reuniones (Seguimiento temporal) ───────────
  runTracker() {
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);

    let shownReminders = {};
    try {
      shownReminders = JSON.parse(localStorage.getItem('shown_meeting_reminders') || '{}');
    } catch (e) {
      shownReminders = {};
    }

    let storageUpdated = false;

    this.meetings.forEach(m => {
      const start = new Date(m.start_time);
      const diffMs = start - now;
      const diffMins = diffMs / 60000;

      // 1. Recordatorio Mañana ("Mañana tienes una reunion")
      const isTomorrow = start.getFullYear() === tomorrow.getFullYear() &&
                         start.getMonth() === tomorrow.getMonth() &&
                         start.getDate() === tomorrow.getDate();
      if (isTomorrow && !shownReminders[`${m.id}_tomorrow`]) {
        shownReminders[`${m.id}_tomorrow`] = true;
        storageUpdated = true;
        App.toast(
          `Mañana tienes una reunión: "${m.title}".<br><span style="text-decoration:underline; font-size:0.75rem; font-weight:bold;">Por favor, haz clic aquí para dirigirte a la reunión</span>`,
          'info',
          7000,
          () => {
            App.navigate('calendar');
            setTimeout(() => Calendar.showMeetingDetail(m.id), 300);
            if (m.meet_link) window.open(m.meet_link, '_blank');
          }
        );
      }

      // 2. Recordatorio Hoy ("Hoy es la reunion a las --/--")
      const isToday = start.getFullYear() === now.getFullYear() &&
                       start.getMonth() === now.getMonth() &&
                       start.getDate() === now.getDate();
      if (isToday && diffMs > 0 && !shownReminders[`${m.id}_today`]) {
        shownReminders[`${m.id}_today`] = true;
        storageUpdated = true;
        const timeStr = start.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        App.toast(
          `Hoy es la reunión a las ${timeStr}: "${m.title}".<br><span style="text-decoration:underline; font-size:0.75rem; font-weight:bold;">Por favor, haz clic aquí para dirigirte a la reunión</span>`,
          'info',
          7000,
          () => {
            App.navigate('calendar');
            setTimeout(() => Calendar.showMeetingDetail(m.id), 300);
            if (m.meet_link) window.open(m.meet_link, '_blank');
          }
        );
      }

      // 3. Recordatorio 10 minutos antes ("En 10 minutos empieza la reunion")
      if (diffMs > 0 && diffMins <= 10 && diffMins > 5 && !shownReminders[`${m.id}_10min`]) {
        shownReminders[`${m.id}_10min`] = true;
        storageUpdated = true;
        App.toast(
          `En 10 minutos empieza la reunión: "${m.title}".<br><span style="text-decoration:underline; font-size:0.75rem; font-weight:bold;">Por favor, haz clic aquí para dirigirte a la reunión</span>`,
          'info',
          8500,
          () => {
            App.navigate('calendar');
            setTimeout(() => Calendar.showMeetingDetail(m.id), 300);
            if (m.meet_link) window.open(m.meet_link, '_blank');
          }
        );
        App.playChime();
      }

      // 4. Recordatorio 5 minutos antes ("En 5 minutos empieza la reunion")
      if (diffMs > 0 && diffMins <= 5 && !shownReminders[`${m.id}_5min`]) {
        shownReminders[`${m.id}_5min`] = true;
        storageUpdated = true;
        App.toast(
          `En 5 minutos empieza la reunión: "${m.title}".<br><span style="text-decoration:underline; font-size:0.75rem; font-weight:bold;">Por favor, haz clic aquí para dirigirte a la reunión</span>`,
          'info',
          8500,
          () => {
            App.navigate('calendar');
            setTimeout(() => Calendar.showMeetingDetail(m.id), 300);
            if (m.meet_link) window.open(m.meet_link, '_blank');
          }
        );
        App.playChime();
      }
    });

    if (storageUpdated) {
      localStorage.setItem('shown_meeting_reminders', JSON.stringify(shownReminders));
    }
  },

  // ─── Cargar proyectos para el select ──────────────────────
  async loadProjectsForSelect() {
    try {
      const projects = await App.apiFetch('/api/projects');
      const sel = document.getElementById('meetProject');
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.type.toUpperCase()})`;
        sel.appendChild(opt);
      });
    } catch { /* ignorar */ }
  },

  // ─── Renderizar calendario mensual ─────────────────────────
  renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const titleEl = document.getElementById('calMonthTitle');
    if (!grid || !titleEl) return;

    const year = this.currentYear;
    const month = this.currentMonth;

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    titleEl.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const today = new Date();

    let cells = '';
    let cellCount = 0;

    // Días del mes anterior
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrev - i;
      cells += `<div class="cal-cell other-month"><div class="cal-cell-num">${day}</div></div>`;
      cellCount++;
    }

    // Días del mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
      const dayMeetings = this.getMeetingsForDay(year, month, d);

      const eventsHtml = dayMeetings.slice(0, 2).map(m => {
        const isMine = m.created_by === this.currentUserId;
        const time = new Date(m.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        return `<span class="cal-event-pill ${isMine ? 'mine' : ''}"
                      onclick="Calendar.showMeetingDetail('${m.id}'); event.stopPropagation();"
                      title="${App.escapeHtml(m.title)} – ${time}">
                  ${App.escapeHtml(m.title.substring(0, 12))}${m.title.length > 12 ? '…' : ''}
                </span>`;
      }).join('');

      const more = dayMeetings.length > 2 ? `<span style="font-size:0.62rem; color:var(--text-muted);">${dayMeetings.length - 2} más</span>` : '';
      const isSelected = this.selectedDay && this.selectedDay.year === year && this.selectedDay.month === month && this.selectedDay.day === d;

      cells += `
        <div class="cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" onclick="Calendar.selectDay(${year}, ${month}, ${d})">
          <div class="cal-cell-num">${d}</div>
          ${eventsHtml}${more}
        </div>`;
      cellCount++;
    }

    // Rellenar hasta completar filas
    const remaining = 42 - cellCount;
    for (let d = 1; d <= remaining; d++) {
      cells += `<div class="cal-cell other-month"><div class="cal-cell-num">${d}</div></div>`;
    }

    grid.innerHTML = cells;
  },

  getMeetingsForDay(year, month, day) {
    return this.meetings.filter(m => {
      const d = new Date(m.start_time);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  },

  selectDay(year, month, day) {
    this.selectedDay = { year, month, day };
    this.renderCalendar();
    this.renderDayDetail();
  },

  renderDayDetail() {
    const panel = document.getElementById('dayDetailPanel');
    if (!panel || !this.selectedDay) return;

    const dayMeetings = this.getMeetingsForDay(this.selectedDay.year, this.selectedDay.month, this.selectedDay.day);
    const slots = [
      { label: '9 AM', start: '09:00', end: '10:00' },
      { label: '10 AM', start: '10:00', end: '11:00' },
      { label: '11 AM', start: '11:00', end: '12:00' },
      { label: '12 PM', start: '12:00', end: '13:00' },
      { label: '1 PM', start: '13:00', end: '14:00' },
      { label: '2 PM', start: '14:00', end: '15:00' },
      { label: '3 PM', start: '15:00', end: '16:00' },
      { label: '4 PM', start: '16:00', end: '17:00' },
      { label: '5 PM', start: '17:00', end: '18:00' },
      { label: '6 PM', start: '18:00', end: '19:00' },
      { label: '7 PM', start: '19:00', end: '20:00' },
      { label: '8 PM', start: '20:00', end: '21:00' },
      { label: '9 PM', start: '21:00', end: '22:00' },
      { label: '10 PM', start: '22:00', end: '23:00' },
      { label: '11 PM', start: '23:00', end: '00:00' }
    ];

    const slotListHtml = slots.map(slot => {
      const [sH, sM] = slot.start.split(':').map(Number);
      const [eH, eM] = slot.end.split(':').map(Number);

      const year = this.selectedDay.year;
      const month = this.selectedDay.month;
      const day = this.selectedDay.day;

      const slotStart = new Date(year, month, day, sH, sM, 0);
      const slotEnd = new Date(year, month, day, eH, eM, 0);

      // Check overlapping meetings
      const overlappingMeeting = dayMeetings.find(m => {
        const mStart = new Date(m.start_time);
        const mEnd = new Date(m.end_time);
        return mStart < slotEnd && mEnd > slotStart;
      });

      if (overlappingMeeting) {
        const isMine = overlappingMeeting.created_by === this.currentUserId;
        const isPrivate = overlappingMeeting.visibility === 'PRIVATE' && !isMine;

        let statusText = '';
        let statusClass = 'busy';
        let cardContent = '';

        if (isPrivate) {
          statusText = 'Privado';
          statusClass += ' private';
          cardContent = `
            <div class="timeline-meeting-card private">
              <span class="m-title">Reservado (Privado)</span>
              <span class="m-creator">Organizador: ${App.escapeHtml(overlappingMeeting.creator_name)}</span>
            </div>
          `;
        } else {
          statusText = isMine ? 'Mi reunión' : 'Reunión';
          if (isMine) statusClass += ' mine';
          cardContent = `
            <div class="timeline-meeting-card ${isMine ? 'mine' : ''}">
              <div class="m-header">
                <span class="m-title" title="${App.escapeHtml(overlappingMeeting.title)}">${App.escapeHtml(overlappingMeeting.title)}</span>
                ${overlappingMeeting.meet_link ? `
                  <a href="${overlappingMeeting.meet_link}" target="_blank" class="timeline-meet-btn" title="Unirse a Google Meet">
                    <i class="bi bi-camera-video-fill"></i>
                  </a>
                ` : ''}
              </div>
              <span class="m-creator">Org: ${App.escapeHtml(overlappingMeeting.creator_name)}</span>
            </div>
          `;
        }

        return `
          <div class="timeline-slot-row busy">
            <div class="timeline-hour-col">${slot.label}</div>
            <div class="timeline-cell-col busy">
              ${cardContent}
            </div>
          </div>
        `;
      } else {
        return `
          <div class="timeline-slot-row free">
            <div class="timeline-hour-col">${slot.label}</div>
            <div class="timeline-cell-col free" onclick="Calendar.openCreateModalForSlot(${year}, ${month}, ${day}, '${slot.start}', '${slot.end}')">
              <span class="btn-slot-reserve"><i class="bi bi-plus-lg"></i> Reservar</span>
            </div>
          </div>
        `;
      }
    }).join('');

    const dateObj = new Date(this.selectedDay.year, this.selectedDay.month, this.selectedDay.day);
    const dayNamesShort = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
    const dayOfWeekStr = dayNamesShort[dateObj.getDay()];
    const dayNum = dateObj.getDate();

    panel.innerHTML = `
      <div class="timeline-day-planner">
        <div class="timeline-header-cell">
          <div class="day-name-label">${dayOfWeekStr}</div>
          <div class="day-number-label">${dayNum}</div>
        </div>
        <div class="timezone-indicator">GMT-05</div>
        <div class="timeline-grid-body">
          ${slotListHtml}
        </div>
      </div>
    `;
  },

  openCreateModalForSlot(year, month, day, startTimeStr, endTimeStr) {
    this.openCreateModal();
    const [sH, sM] = startTimeStr.split(':').map(Number);
    const [eH, eM] = endTimeStr.split(':').map(Number);
    const startDt = new Date(year, month, day, sH, sM);
    const endDt = new Date(year, month, day, eH, eM);

    const formatLocal = (dt) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    };

    document.getElementById('meetStart').value = formatLocal(startDt);
    document.getElementById('meetEnd').value = formatLocal(endDt);
  },

  prevMonth() {
    if (this.currentMonth === 0) { this.currentMonth = 11; this.currentYear--; }
    else this.currentMonth--;
    this.renderCalendar();
    this.renderDayDetail();
  },

  nextMonth() {
    if (this.currentMonth === 11) { this.currentMonth = 0; this.currentYear++; }
    else this.currentMonth++;
    this.renderCalendar();
    this.renderDayDetail();
  },

  // ─── Lista de reuniones ────────────────────────────────────
  applyFilter() {
    this.renderMeetingsList();
  },

  renderMeetingsList() {
    const filter = document.getElementById('meetingFilter')?.value || 'upcoming';
    const now = new Date();
    let filtered = [...this.meetings];

    if (filter === 'upcoming') {
      filtered = filtered.filter(m => new Date(m.end_time) >= now);
    } else if (filter === 'past') {
      filtered = filtered.filter(m => new Date(m.end_time) < now);
    } else if (filter === 'mine') {
      filtered = filtered.filter(m => m.created_by === this.currentUserId);
    }

    // Ordenar: próximas = asc, pasadas = desc
    filtered.sort((a, b) => {
      if (filter === 'past') return new Date(b.start_time) - new Date(a.start_time);
      return new Date(a.start_time) - new Date(b.start_time);
    });

    const container = document.getElementById('meetingsList');
    if (!filtered.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="bi bi-calendar-x"></i></div>
          <h3>Sin reuniones</h3>
          <p>No hay reuniones para mostrar en esta vista.</p>
        </div>`;
      return;
    }

    container.innerHTML = filtered.map(m => this.renderMeetingCard(m)).join('');
  },

  renderMeetingCard(m) {
    const start = new Date(m.start_time);
    const end = new Date(m.end_time);
    const isPast = end < new Date();
    const isMine = m.created_by === this.currentUserId;

    const initials = (m.creator_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const avatarHtml = m.creator_avatar
      ? `<img src="${m.creator_avatar}" class="meeting-avatar" alt="${App.escapeHtml(m.creator_name)}" onerror="this.outerHTML='<div class=meeting-avatar-placeholder>${initials}</div>'" />`
      : `<div class="meeting-avatar-placeholder">${initials}</div>`;

    const duration = Math.round((end - start) / 60000);
    const durationStr = duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60 > 0 ? duration % 60 + 'min' : ''}`.trim() : `${duration}min`;

    return `
    <div class="meeting-card" id="meeting-${m.id}" style="${isPast ? 'opacity:0.6;' : ''}">
      ${avatarHtml}
      <div class="meeting-info">
        <div class="meeting-title">
          ${App.escapeHtml(m.title)}
          ${isMine ? '<span style="font-size:0.68rem;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);padding:2px 7px;border-radius:10px;margin-left:6px;font-weight:600;">Mía</span>' : ''}
          ${isPast ? '<span style="font-size:0.68rem;color:var(--text-muted);margin-left:6px;">Finalizada</span>' : ''}
        </div>
        <div class="meeting-meta">
          <span><i class="bi bi-calendar3"></i>
            ${start.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })}
          </span>
          <span><i class="bi bi-clock"></i>
            ${start.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} –
            ${end.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            <span style="color:var(--text-muted);">(${durationStr})</span>
          </span>
          <span><i class="bi bi-person"></i> ${App.escapeHtml(m.creator_name || 'Desconocido')}</span>
          ${m.project_name ? `<span><i class="bi bi-folder"></i> ${App.escapeHtml(m.project_name)}</span>` : ''}
        </div>
        ${m.description ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:5px; line-height:1.5;">
          ${App.escapeHtml(m.description).substring(0, 120)}${m.description.length > 120 ? '…' : ''}
        </div>` : ''}
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end; flex-shrink:0;">
        ${m.meet_link ? `<a href="${m.meet_link}" target="_blank" class="btn-meet">
          <i class="bi bi-camera-video-fill"></i> Unirse
        </a>` : `<span style="font-size:0.72rem; color:var(--text-muted); text-align:center; padding:4px 8px; border:1px solid var(--border); border-radius:6px;">Sin link Meet</span>`}
        ${isMine ? `<button class="btn-danger-custom" style="font-size:0.72rem;padding:4px 8px;"
                           onclick="Calendar.deleteMeeting('${m.id}')">
          <i class="bi bi-trash3"></i>
        </button>` : ''}
      </div>
    </div>`;
  },

  showMeetingDetail(id) {
    const m = this.meetings.find(x => x.id === id);
    if (!m) return;
    const el = document.getElementById(`meeting-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.borderColor = 'var(--accent-blue)';
      setTimeout(() => el.style.borderColor = '', 2000);
    }
  },

  // ─── Abrir modal de nueva reunión ─────────────────────────
  openCreateModal() {
    document.getElementById('meetingForm').reset();
    // Preset: ahora + 1 hora
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    const end = new Date(now.getTime() + 60 * 60000);

    const pad = (n) => String(n).padStart(2, '0');
    const formatLocal = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

    document.getElementById('meetStart').value = formatLocal(now);
    document.getElementById('meetEnd').value = formatLocal(end);
    document.getElementById('meetingModal').style.display = 'flex';
    document.getElementById('meetTitle').focus();
  },

  openCreateModalForDay(year, month, day) {
    this.openCreateModal();
    const pad = (n) => String(n).padStart(2, '0');
    const today = new Date();
    const curHour = today.getHours();
    const startHour = curHour < 23 ? curHour + 1 : 9;
    const endHour = startHour < 23 ? startHour + 1 : 10;

    document.getElementById('meetStart').value = `${year}-${pad(month + 1)}-${pad(day)}T${pad(startHour)}:00`;
    document.getElementById('meetEnd').value = `${year}-${pad(month + 1)}-${pad(day)}T${pad(endHour)}:00`;
  },

  closeModal() {
    document.getElementById('meetingModal').style.display = 'none';
  },

  closeModalOnOverlay(event) {
    if (event.target === event.currentTarget) this.closeModal();
  },

  // ─── Crear reunión ─────────────────────────────────────────
  async submitMeeting(event) {
    if (event) event.preventDefault();

    const btn = document.getElementById('meetingSubmitBtn');
    const title = document.getElementById('meetTitle').value.trim();
    const start = document.getElementById('meetStart').value;
    const end = document.getElementById('meetEnd').value;

    if (!title || !start || !end) {
      App.toast('Completa los campos requeridos', 'error');
      return;
    }

    if (new Date(end) <= new Date(start)) {
      App.toast('La hora de fin debe ser posterior al inicio', 'error');
      return;
    }

    const attendeesRaw = document.getElementById('meetAttendees').value;
    const attendee_emails = attendeesRaw
      ? attendeesRaw.split(',').map(e => e.trim()).filter(Boolean)
      : [];

    const body = {
      title,
      description: document.getElementById('meetDesc').value,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      project_id: document.getElementById('meetProject').value || null,
      attendee_emails,
      visibility: document.getElementById('meetVisibility').value,
    };

    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Creando...';
    btn.disabled = true;

    try {
      const meeting = await App.apiFetch('/api/meetings', { method: 'POST', body: JSON.stringify(body) });
      this.closeModal();
      App.toast(meeting.meet_link
        ? '✓ Reunión creada con Google Meet'
        : '✓ Reunión creada (sin link Meet — verifica credenciales Google)',
        'success', 5000);
      await this.loadMeetings();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    } finally {
      btn.innerHTML = '<i class="bi bi-camera-video"></i> Crear Reunión';
      btn.disabled = false;
    }
  },

  // ─── Eliminar reunión ──────────────────────────────────────
  async deleteMeeting(id) {
    if (!confirm('¿Cancelar esta reunión? Se eliminará de Google Calendar.')) return;
    try {
      await App.apiFetch(`/api/meetings/${id}`, { method: 'DELETE' });
      App.toast('Reunión cancelada', 'info');
      await this.loadMeetings();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  },
};

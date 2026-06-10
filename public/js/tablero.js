/* ============================================================
   AtomTask – tablero.js
   Módulo de Tablero Kanban interactivo con Drag & Drop
   ============================================================ */

'use strict';

const Tablero = {
  projects: [],

  async init() {
    await this.loadProjects();
  },

  async loadProjects() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    board.innerHTML = `<div class="loading-overlay" style="grid-column: 1/-1;"><div class="spinner"></div></div>`;

    try {
      this.projects = await App.apiFetch('/api/projects');
      this.renderBoard();
    } catch (err) {
      board.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon"><i class="bi bi-exclamation-triangle"></i></div>
          <h3>Error al cargar el tablero</h3>
          <p>${App.escapeHtml(err.message)}</p>
        </div>`;
    }
  },

  renderBoard() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    const columns = [
      { id: 'SIN INICIAR', name: 'Sin Iniciar', icon: 'bi-dash-circle', color: '#64748b' },
      { id: 'EN PROCESO', name: 'En Proceso', icon: 'bi-play-circle', color: '#3b82f6' },
      { id: 'STAND BY', name: 'Stand By', icon: 'bi-pause-circle', color: '#fbbf24' },
      { id: 'REVISIÓN', name: 'Revisión', icon: 'bi-eye', color: '#a78bfa' },
      { id: 'ENTREGADO', name: 'Entregado', icon: 'bi-send-check', color: '#10b981' },
      { id: 'COMPLETADO', name: 'Completado', icon: 'bi-check-circle', color: '#059669' }
    ];

    board.innerHTML = columns.map(col => {
      const colProjects = this.projects.filter(p => p.status === col.id);

      const cardsHtml = colProjects.map(p => {
        const initials = (p.responsible || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        return `
          <div class="kanban-card" draggable="${p.user_can_edit ? 'true' : 'false'}" ${p.user_can_edit ? `ondragstart="Tablero.drag(event, '${p.id}')"` : ''} onclick="App.navigate('detail'); detailProject('${p.id}')" style="${!p.user_can_edit ? 'cursor: pointer; opacity: 0.8;' : 'cursor: grab;'}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
              <span class="badge-type badge-${p.type}">${App.escapeHtml(p.type)}</span>
              <span class="badge-importance importance-${p.importance.toLowerCase().replace('/', '-').replace(' ', '-')}" style="font-size:0.6rem; padding:1px 6px;">
                ${App.escapeHtml(p.importance)}
              </span>
            </div>
            <h4 class="kanban-card-title">${App.escapeHtml(p.name)}</h4>
            ${p.client ? `<p class="kanban-card-meta"><i class="bi bi-building"></i> ${App.escapeHtml(p.client)}</p>` : ''}
            
            <div class="kanban-card-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px solid var(--border-bright); padding-top:8px;">
              <div style="display:flex; align-items:center; gap:4px; font-size:0.75rem; color:var(--text-secondary);">
                <i class="bi bi-list-task"></i>
                <span>${p.completed_tasks || 0}/${p.total_tasks || 0}</span>
              </div>
              <div class="meeting-avatar-placeholder" style="width:24px; height:24px; font-size:0.65rem;" title="Responsable: ${App.escapeHtml(p.responsible || 'Sin asignar')}">
                ${initials}
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="kanban-column" ondragover="Tablero.allowDrop(event)" ondrop="Tablero.drop(event, '${col.id}')">
          <div class="kanban-column-header" style="border-bottom: 2px solid ${col.color};">
            <span style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:0.85rem; color:var(--text-primary);">
              <i class="bi ${col.icon}" style="color:${col.color};"></i>
              ${col.name}
            </span>
            <span class="kanban-column-count">${colProjects.length}</span>
          </div>
          <div class="kanban-cards-container">
            ${cardsHtml || `<div class="kanban-empty-placeholder">Arrastra proyectos aquí</div>`}
          </div>
        </div>
      `;
    }).join('');
  },

  allowDrop(ev) {
    ev.preventDefault();
  },

  drag(ev, projectId) {
    ev.dataTransfer.setData('text/plain', projectId);
  },

  async drop(ev, newStatus) {
    ev.preventDefault();
    const projectId = ev.dataTransfer.getData('text/plain');
    if (!projectId) return;

    const project = this.projects.find(p => p.id === projectId);
    if (!project || !project.user_can_edit) {
      App.toast('No tienes permisos de edición para mover este proyecto', 'error');
      return;
    }
    if (project.status === newStatus) return;

    // Actualización optimista en UI
    const oldStatus = project.status;
    project.status = newStatus;
    this.renderBoard();

    try {
      // Obtener el detalle completo del proyecto para hacer el PUT
      const fullProject = await App.apiFetch(`/api/projects/${projectId}`);
      fullProject.status = newStatus;

      // Realizar PUT al backend
      await App.apiFetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(fullProject)
      });
      App.toast(`✓ Proyecto movido a ${newStatus}`, 'success');
      await this.loadProjects(); // Recargar de base de datos
    } catch (err) {
      project.status = oldStatus;
      this.renderBoard();
      App.toast(`Error al mover proyecto: ${err.message}`, 'error');
    }
  }
};

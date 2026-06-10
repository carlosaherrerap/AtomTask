'use strict';

const Privacidad = {
  contacts: [],
  groups: [],
  userProjects: [],
  currentRules: [],

  async init() {
    try {
      await Promise.all([
        this.loadContacts(),
        this.loadGroups(),
        this.loadDefaultVisibility(),
        this.loadUserProjects()
      ]);
      // Resetear vista del proyecto seleccionado
      document.getElementById('privSelectProject').value = '';
      document.getElementById('privVisibility').value = 'PUBLIC';
      document.getElementById('privRuleSelectionArea').style.display = 'none';
    } catch (err) {
      console.error('Error inicializando Privacidad:', err);
      App.toast('Error al cargar la configuración de privacidad', 'error');
    }
  },

  // ─── Contactos ──────────────────────────────────────────────
  async loadContacts() {
    try {
      this.contacts = await App.apiFetch('/api/privacy/contacts');
      this.renderContacts();
      this.renderGroupMemberCheckboxes();
    } catch (err) {
      App.toast('Error al cargar contactos', 'error');
    }
  },

  renderContacts() {
    const container = document.getElementById('contactsListContainer');
    if (!container) return;

    if (this.contacts.length === 0) {
      container.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:12px;">No tienes contactos creados.</p>`;
      return;
    }

    container.innerHTML = this.contacts.map(c => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border-bottom:1px solid var(--border-bright); font-size:0.82rem;">
        <div>
          <span style="font-weight:600; color:var(--text-primary);">${App.escapeHtml(c.name)}</span>
          <span style="color:var(--text-muted); margin-left:6px; font-size:0.75rem;">(${App.escapeHtml(c.email)})</span>
        </div>
        <button class="btn-danger-custom" style="padding:2px 6px; font-size:0.7rem;" onclick="Privacidad.deleteContact('${c.id}')">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `).join('');
  },

  renderGroupMemberCheckboxes() {
    const container = document.getElementById('groupMemberCheckboxList');
    if (!container) return;

    if (this.contacts.length === 0) {
      container.innerHTML = `<p style="font-size:0.75rem; color:var(--text-muted); padding:4px;">Crea contactos primero para agregarlos a un grupo.</p>`;
      return;
    }

    container.innerHTML = this.contacts.map(c => `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:0.75rem;">
        <input type="checkbox" id="grp-chk-${c.id}" value="${c.id}" class="group-member-checkbox" />
        <label for="grp-chk-${c.id}" style="cursor:pointer; color:var(--text-secondary);">${App.escapeHtml(c.name)}</label>
      </div>
    `).join('');
  },

  async createContact(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('contactName');
    const emailInput = document.getElementById('contactEmail');
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    if (!name || !email) return;

    try {
      await App.apiFetch('/api/privacy/contacts', {
        method: 'POST',
        body: JSON.stringify({ name, email })
      });
      nameInput.value = '';
      emailInput.value = '';
      App.toast('Contacto agregado', 'success');
      await this.loadContacts();
      // Recargar también proyectos y entorno
      if (document.getElementById('privSelectProject').value) {
        this.onVisibilityChange();
      }
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async deleteContact(id) {
    if (!confirm('¿Eliminar este contacto?')) return;
    try {
      await App.apiFetch(`/api/privacy/contacts/${id}`, { method: 'DELETE' });
      App.toast('Contacto eliminado', 'info');
      await this.loadContacts();
      await this.loadGroups(); // Recargar grupos en caso que fuera miembro
      if (document.getElementById('privSelectProject').value) {
        this.onVisibilityChange();
      }
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  // ─── Grupos ──────────────────────────────────────────────────
  async loadGroups() {
    try {
      this.groups = await App.apiFetch('/api/privacy/groups');
      this.renderGroups();
    } catch (err) {
      App.toast('Error al cargar grupos', 'error');
    }
  },

  renderGroups() {
    const container = document.getElementById('groupsListContainer');
    if (!container) return;

    if (this.groups.length === 0) {
      container.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:12px;">No tienes grupos creados.</p>`;
      return;
    }

    container.innerHTML = this.groups.map(g => {
      const membersStr = g.members && g.members.length > 0
        ? g.members.map(m => m.name).join(', ')
        : 'Sin miembros';
      return `
        <div style="padding:10px; border-bottom:1px solid var(--border-bright); font-size:0.82rem;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
            <span style="font-weight:700; color:var(--accent-blue);">${App.escapeHtml(g.name)}</span>
            <button class="btn-danger-custom" style="padding:2px 6px; font-size:0.7rem;" onclick="Privacidad.deleteGroup('${g.id}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
          <div style="color:var(--text-secondary); font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${App.escapeHtml(membersStr)}">
            Miembros: ${App.escapeHtml(membersStr)}
          </div>
        </div>
      `;
    }).join('');
  },

  async createGroup(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('groupName');
    const name = nameInput.value.trim();

    if (!name) return;

    // Obtener los ids seleccionados
    const checkboxes = document.querySelectorAll('.group-member-checkbox:checked');
    const memberIds = Array.from(checkboxes).map(cb => cb.value);

    try {
      await App.apiFetch('/api/privacy/groups', {
        method: 'POST',
        body: JSON.stringify({ name, memberIds })
      });
      nameInput.value = '';
      document.querySelectorAll('.group-member-checkbox').forEach(cb => cb.checked = false);
      App.toast('Grupo creado ✓', 'success');
      await this.loadGroups();
      if (document.getElementById('privSelectProject').value) {
        this.onVisibilityChange();
      }
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async deleteGroup(id) {
    if (!confirm('¿Eliminar este grupo?')) return;
    try {
      await App.apiFetch(`/api/privacy/groups/${id}`, { method: 'DELETE' });
      App.toast('Grupo eliminado', 'info');
      await this.loadGroups();
      if (document.getElementById('privSelectProject').value) {
        this.onVisibilityChange();
      }
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  // ─── Proyectos y Reglas ──────────────────────────────────────
  async loadUserProjects() {
    try {
      const projects = await App.apiFetch('/api/projects');
      // Solo cargar los que fueron creados por mí para cambiar sus reglas
      this.userProjects = projects.filter(p => p.created_by === AppState.user?.id);

      const select = document.getElementById('privSelectProject');
      if (select) {
        select.innerHTML = '<option value="">-- Seleccionar proyecto --</option>' +
          this.userProjects.map(p => `<option value="${p.id}">${App.escapeHtml(p.name)} (${p.type.toUpperCase()})</option>`).join('');
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  },

  async loadDefaultVisibility() {
    try {
      const res = await App.apiFetch('/api/privacy/default-visibility');
      const select = document.getElementById('privDefaultVisibility');
      if (select) select.value = res.default_visibility || 'PUBLIC';
    } catch (err) {
      console.error('Error default visibility:', err);
    }
  },

  async saveDefaultVisibility() {
    const select = document.getElementById('privDefaultVisibility');
    const val = select.value;

    try {
      await App.apiFetch('/api/privacy/default-visibility', {
        method: 'POST',
        body: JSON.stringify({ default_visibility: val })
      });
      App.toast('Preferencia de visibilidad guardada ✓', 'success');
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async loadProjectRules() {
    const projectId = document.getElementById('privSelectProject').value;
    if (!projectId) {
      document.getElementById('privRuleSelectionArea').style.display = 'none';
      document.getElementById('privCollaboratorsPanel').style.display = 'none';
      return;
    }

    try {
      const res = await App.apiFetch(`/api/privacy/rules/${projectId}`);
      document.getElementById('privVisibility').value = res.visibility;
      this.currentRules = res.rules || [];
      this.onVisibilityChange();
      await this.loadCollaboratorsPermissions(projectId);
    } catch (err) {
      App.toast('Error al obtener reglas del proyecto', 'error');
    }
  },

  onVisibilityChange() {
    const visibility = document.getElementById('privVisibility').value;
    const selectionArea = document.getElementById('privRuleSelectionArea');
    const label = document.getElementById('privSelectionLabel');
    const list = document.getElementById('privTargetList');

    if (visibility === 'PUBLIC' || visibility === 'PRIVATE') {
      selectionArea.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    selectionArea.style.display = 'block';

    if (visibility === 'CONTACTS') {
      label.innerHTML = '<i class="bi bi-people-fill"></i> Seleccionar Contactos o Grupos Permitidos';

      let html = '';
      // Renderizar Grupos primero
      if (this.groups.length > 0) {
        html += `<div style="font-weight:700; font-size:0.72rem; color:var(--accent-blue); border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:2px; margin:6px 0 4px;">GRUPOS</div>`;
        html += this.groups.map(g => {
          const isChecked = this.currentRules.some(r => r.rule_type === 'GROUP' && r.target_id === g.id);
          return `
            <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; padding:2px 4px;">
              <input type="checkbox" id="rule-grp-${g.id}" value="${g.id}" data-type="GROUP" ${isChecked ? 'checked' : ''} />
              <label for="rule-grp-${g.id}" style="cursor:pointer; color:var(--text-primary);"><i class="bi bi-collection" style="color:var(--accent-blue);"></i> ${App.escapeHtml(g.name)}</label>
            </div>
          `;
        }).join('');
      }

      // Renderizar Contactos
      if (this.contacts.length > 0) {
        html += `<div style="font-weight:700; font-size:0.72rem; color:var(--accent-emerald); border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:2px; margin:8px 0 4px;">CONTACTOS</div>`;
        html += this.contacts.map(c => {
          const isChecked = this.currentRules.some(r => r.rule_type === 'CONTACT' && r.target_id === c.id);
          return `
            <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; padding:2px 4px;">
              <input type="checkbox" id="rule-cnt-${c.id}" value="${c.id}" data-type="CONTACT" ${isChecked ? 'checked' : ''} />
              <label for="rule-cnt-${c.id}" style="cursor:pointer; color:var(--text-secondary);"><i class="bi bi-person"></i> ${App.escapeHtml(c.name)}</label>
            </div>
          `;
        }).join('');
      }

      if (!html) {
        html = `<p style="font-size:0.75rem; color:var(--text-muted); text-align:center; padding:10px;">Crea contactos o grupos para poder asignarlos.</p>`;
      }

      list.innerHTML = html;

    } else if (visibility === 'EXCEPT') {
      label.innerHTML = '<i class="bi bi-person-x-fill"></i> Ocultar de la visibilidad a estos Contactos';

      let html = '';
      if (this.contacts.length > 0) {
        html += this.contacts.map(c => {
          const isChecked = this.currentRules.some(r => r.rule_type === 'EXCEPT_CONTACT' && r.target_id === c.id);
          return `
            <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; padding:2px 4px;">
              <input type="checkbox" id="rule-exc-${c.id}" value="${c.id}" data-type="EXCEPT_CONTACT" ${isChecked ? 'checked' : ''} />
              <label for="rule-exc-${c.id}" style="cursor:pointer; color:var(--text-secondary);"><i class="bi bi-person-x" style="color:var(--accent-red);"></i> ${App.escapeHtml(c.name)}</label>
            </div>
          `;
        }).join('');
      }

      if (!html) {
        html = `<p style="font-size:0.75rem; color:var(--text-muted); text-align:center; padding:10px;">Crea contactos primero para poder excluirlos.</p>`;
      }

      list.innerHTML = html;
    }
  },

  async saveProjectRules() {
    const projectId = document.getElementById('privSelectProject').value;
    if (!projectId) {
      App.toast('Por favor, selecciona un proyecto primero', 'error');
      return;
    }

    const visibility = document.getElementById('privVisibility').value;
    const rules = [];

    if (visibility === 'CONTACTS' || visibility === 'EXCEPT') {
      const checked = document.querySelectorAll('#privTargetList input[type="checkbox"]:checked');
      checked.forEach(cb => {
        rules.push({
          rule_type: cb.getAttribute('data-type'),
          target_id: cb.value
        });
      });

      if (rules.length === 0) {
        App.toast('Debes seleccionar al menos un contacto o grupo en esta visibilidad', 'error');
        return;
      }
    }

    try {
      await App.apiFetch(`/api/privacy/rules/${projectId}`, {
        method: 'POST',
        body: JSON.stringify({ visibility, rules })
      });
      App.toast('Configuración de entorno guardada con éxito ✓', 'success');
      await this.loadProjectRules();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  // ─── Permisos de Colaboradores ─────────────────────────────
  async loadCollaboratorsPermissions(projectId) {
    const panel = document.getElementById('privCollaboratorsPanel');
    const contactSelect = document.getElementById('permContactSelect');
    if (!panel) return;

    try {
      const permissions = await App.apiFetch(`/api/projects/${projectId}/permissions`);
      panel.style.display = 'block';

      // Llenar select de contactos
      if (contactSelect) {
        contactSelect.innerHTML = '<option value="">-- Seleccionar de mis contactos --</option>' +
          this.contacts.map(c => `<option value="${App.escapeHtml(c.email)}">${App.escapeHtml(c.name)} (${App.escapeHtml(c.email)})</option>`).join('');
      }

      this.renderCollaboratorsPermissions(permissions);
    } catch (err) {
      panel.style.display = 'none';
    }
  },

  renderCollaboratorsPermissions(permissions) {
    const container = document.getElementById('collaboratorsPermissionsList');
    if (!container) return;

    if (!permissions || permissions.length === 0) {
      container.innerHTML = `<p style="font-size:0.75rem; color:var(--text-muted); font-style:italic; text-align:center; padding:8px;">No hay colaboradores con permisos.</p>`;
      return;
    }

    container.innerHTML = permissions.map(p => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:4px; font-size:0.75rem; margin-bottom:4px;">
        <div style="flex:1; min-width:0; margin-right:8px;">
          <div style="font-weight:700; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${App.escapeHtml(p.email)}">${App.escapeHtml(p.email)}</div>
          <div style="font-size:0.65rem; color:var(--text-muted); display:flex; gap:8px; margin-top:2px;">
            <span>VER: ${p.can_view ? '✓' : '✗'}</span>
            <span>EDITAR: ${p.can_edit ? '✓' : '✗'}</span>
            <span>ELIMINAR: ${p.can_delete ? '✓' : '✗'}</span>
          </div>
        </div>
        <button class="btn-danger-custom" style="padding:2px 6px; font-size:0.7rem;" onclick="Privacidad.deleteCollaboratorPermission('${p.email}')">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `).join('');
  },

  onPermContactSelectChange() {
    const email = document.getElementById('permContactSelect').value;
    if (email) {
      document.getElementById('permEmailInput').value = email;
    }
  },

  async addCollaboratorPermission() {
    const projectId = document.getElementById('privSelectProject').value;
    const email = document.getElementById('permEmailInput').value.trim();
    
    if (!projectId || !email) {
      App.toast('Por favor, selecciona un proyecto e introduce un correo electrónico', 'error');
      return;
    }

    const body = {
      email,
      can_view: document.getElementById('permCanView').checked,
      can_edit: document.getElementById('permCanEdit').checked,
      can_delete: document.getElementById('permCanDelete').checked
    };

    try {
      await App.apiFetch(`/api/projects/${projectId}/permissions`, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      
      App.toast('Permiso asignado con éxito ✓', 'success');
      document.getElementById('permEmailInput').value = '';
      document.getElementById('permContactSelect').value = '';
      document.getElementById('permCanView').checked = true;
      document.getElementById('permCanEdit').checked = false;
      document.getElementById('permCanDelete').checked = false;

      await this.loadCollaboratorsPermissions(projectId);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async deleteCollaboratorPermission(email) {
    const projectId = document.getElementById('privSelectProject').value;
    if (!projectId || !confirm(`¿Eliminar los permisos de colaboración para ${email}?`)) return;

    try {
      await App.apiFetch(`/api/projects/${projectId}/permissions/${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });
      App.toast('Permiso eliminado', 'info');
      await this.loadCollaboratorsPermissions(projectId);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }
};

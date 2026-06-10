'use strict';

const Detail = {
  currentProject: null,
  activeSections: [],
  selectedTechs: [],
  contacts: [],
  techConfigs: [],

  // Sugerencias populares de tecnologías para el Tech Builder con Devicon
  TECH_SUGGESTIONS: [
    { name: 'React', icon: 'devicon-react-original colored' },
    { name: 'Angular', icon: 'devicon-angularjs-plain colored' },
    { name: 'Vue.js', icon: 'devicon-vuejs-plain colored' },
    { name: 'Svelte', icon: 'devicon-svelte-plain colored' },
    { name: 'Bootstrap', icon: 'devicon-bootstrap-plain colored' },
    { name: 'Tailwind CSS', icon: 'devicon-tailwindcss-original colored' },
    { name: 'HTML5', icon: 'devicon-html5-plain colored' },
    { name: 'CSS3', icon: 'devicon-css3-plain colored' },
    { name: 'Node.js', icon: 'devicon-nodejs-plain colored' },
    { name: 'Express', icon: 'devicon-express-original' },
    { name: 'Python', icon: 'devicon-python-plain colored' },
    { name: 'Django', icon: 'devicon-django-plain colored' },
    { name: 'Flask', icon: 'devicon-flask-original colored' },
    { name: 'Java', icon: 'devicon-java-plain colored' },
    { name: 'Spring Boot', icon: 'devicon-spring-original colored' },
    { name: 'PostgreSQL', icon: 'devicon-postgresql-plain colored' },
    { name: 'MongoDB', icon: 'devicon-mongodb-plain colored' },
    { name: 'MySQL', icon: 'devicon-mysql-plain colored' },
    { name: 'SQLite', icon: 'devicon-sqlite-plain colored' },
    { name: 'Docker', icon: 'devicon-docker-plain colored' },
    { name: 'Kubernetes', icon: 'devicon-kubernetes-plain colored' },
    { name: 'AWS', icon: 'devicon-amazonwebservices-plain-wordmark colored' },
    { name: 'Google Cloud (GCP)', icon: 'devicon-googlecloud-plain colored' },
    { name: 'Azure', icon: 'devicon-azure-plain colored' },
    { name: 'Terraform', icon: 'devicon-terraform-plain colored' },
    { name: 'Git', icon: 'devicon-git-plain colored' },
    { name: 'GitHub', icon: 'devicon-github-original' },
    { name: 'GitLab', icon: 'devicon-gitlab-plain colored' },
    { name: 'Jenkins', icon: 'devicon-jenkins-line colored' }
  ],

  // ─── Abrir detalle ─────────────────────────────────────────
  async openProject(id) {
    App.navigate('detail');
    const container = document.getElementById('detailContent');
    container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';

    try {
      // Cargar proyecto, contactos del usuario y configuraciones de stack
      const [project, contactsList, techConfigsList] = await Promise.all([
        App.apiFetch(`/api/projects/${id}`),
        App.apiFetch('/api/privacy/contacts').catch(() => []),
        App.apiFetch(`/api/projects/${id}/tech-config`).catch(() => [])
      ]);

      this.currentProject = project;
      this.contacts = contactsList;
      this.techConfigs = techConfigsList;
      this.selectedTechs = [];

      // Inicializar secciones del checklist
      const taskSections = [...new Set(project.tasks.map(t => t.section || 'General'))];
      this.activeSections = project.tasks.length > 0 ? taskSections : [];

      this.renderDetail(project);
    } catch (err) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><i class="bi bi-exclamation-triangle"></i></div>
        <h3>Error al cargar el proyecto</h3><p>${App.escapeHtml(err.message)}</p>
      </div>`;
    }
  },

  // ─── Render principal ──────────────────────────────────────
  renderDetail(p) {
    const container = document.getElementById('detailContent');
    const isScript = p.type === 'script';
    const typeSpecificHtml = isScript ? this.renderScriptSection(p) : this.renderInfraSection(p);

    container.innerHTML = `
      <!-- Header -->
      <div class="detail-header">
        <button class="detail-back" onclick="App.navigate('projects')">
          <i class="bi bi-arrow-left"></i> Proyectos
        </button>
        <div class="detail-title-block">
          <div class="detail-title">${App.escapeHtml(p.name)}</div>
          <div class="detail-meta">
            <span class="badge-type badge-${p.type}">
              <i class="bi ${App.getTypeIcon(p.type)}"></i>
              ${p.type.toUpperCase()}
            </span>
            <span class="badge-status ${App.getStatusClass(p.status)}">
              <i class="bi ${App.getStatusIcon(p.status)}"></i>
              ${p.status}
            </span>
            <span class="badge-importance ${App.getImportanceClass(p.importance)}">
              ${App.getImportanceIcon(p.importance)} ${p.importance}
            </span>
          </div>
        </div>
        ${p.user_can_edit ? `
        <button class="btn-secondary-custom" onclick="Projects.openEditModal('${p.id}'); App.navigate('projects');">
          <i class="bi bi-pencil"></i> Editar
        </button>` : ''}
      </div>

      <!-- Fila 1: Info General (Pequeña) y Avance (Circular SVG) -->
      <div class="detail-summary-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:20px; margin-bottom:20px;">
        
        <!-- Info General -->
        <div class="detail-section-compact">
          <div class="detail-section-title"><i class="bi bi-info-circle-fill"></i> Información General</div>
          <div class="info-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
            <div class="info-item">
              <div class="info-item-label">Cliente</div>
              <div class="info-item-value">${App.escapeHtml(p.client) || '<span style="color:var(--text-muted)">—</span>'}</div>
            </div>
            <div class="info-item">
              <div class="info-item-label">Responsable</div>
              <div class="info-item-value">${App.escapeHtml(p.responsible) || '<span style="color:var(--text-muted)">—</span>'}</div>
            </div>
            <div class="info-item">
              <div class="info-item-label">F. Inicio</div>
              <div class="info-item-value">${App.formatDate(p.start_date)}</div>
            </div>
            <div class="info-item">
              <div class="info-item-label">F. Entrega</div>
              <div class="info-item-value">${App.formatDate(p.delivery_date)}</div>
            </div>
            <div class="info-item">
              <div class="info-item-label">Creado por</div>
              <div class="info-item-value">${App.escapeHtml(p.created_by_name) || '—'}</div>
            </div>
          </div>
          ${p.description ? `
          <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
            <div class="info-item-label" style="margin-bottom:2px;">Descripción</div>
            <div style="font-size:0.78rem; color:var(--text-secondary); line-height:1.5; white-space:pre-wrap;">${App.escapeHtml(p.description)}</div>
          </div>` : ''}
        </div>
        
        <!-- Avance en Círculo SVG -->
        <div class="detail-section-compact" style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
          <div class="detail-section-title" style="width:100%; margin-bottom:8px;"><i class="bi bi-pie-chart-fill"></i> Avance del Proyecto</div>
          <div style="position:relative; width:120px; height:120px;">
            <svg width="120" height="120" viewBox="0 0 120 120" class="circular-progress">
              <circle cx="60" cy="60" r="50" class="bg" stroke="#313131" stroke-width="8" fill="none" />
              <circle cx="60" cy="60" r="50" class="fg" id="detailProgressCircleSvg" stroke="var(--accent-primary)" stroke-width="8" fill="none" style="stroke-dasharray: 314; stroke-dashoffset: ${314 - (314 * (p.progress || 0)) / 100}; transform: rotate(-90deg); transform-origin: 50% 50%;" />
              <text x="60" y="65" class="percentage" id="detailProgressText" text-anchor="middle" fill="#ffffff" style="font-size:1.15rem; font-weight:700;">${p.progress || 0}%</text>
            </svg>
          </div>
          <div style="font-size:0.7rem; color:var(--text-muted); margin-top:8px;" id="detailProgressTasksCount">
            ${p.tasks.filter(t => t.is_checked).length} de ${p.tasks.length} funciones completadas
          </div>
        </div>

      </div>

      <!-- Sección específica por tipo -->
      ${typeSpecificHtml}

      <!-- Checklist de funciones (Solo lectura con opción de EDITAR) -->
      <div class="detail-section" style="margin-bottom:20px;">
        <div class="detail-section-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span><i class="bi bi-list-check"></i> Funciones del Proyecto</span>
          ${p.user_can_edit ? `
          <button class="btn-primary-custom" onclick="Detail.openEditTasks()" style="font-size:0.75rem; padding:6px 14px !important;">
            <i class="bi bi-pencil-fill"></i> Editar
          </button>` : ''}
        </div>
        <div id="checklistSectionContainer" style="margin-top:12px;">
          <!-- Rellenado dinámicamente -->
        </div>
      </div>

      <!-- Configuración del Stack Tecnológico (Solo lectura con opción de EDITAR) -->
      <div class="detail-section">
        <div class="detail-section-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span><i class="bi bi-cpu"></i> Configuración de Stack</span>
          ${p.user_can_edit ? `
          <button class="btn-primary-custom" onclick="Detail.openEditStack()" style="font-size:0.75rem; padding:6px 14px !important;">
            <i class="bi bi-pencil-fill"></i> Editar
          </button>` : ''}
        </div>
        <div id="savedTechConfigsList" style="margin-top:12px;">
          <!-- Registros dinámicos -->
        </div>
      </div>
    `;

    this.renderChecklistSection(false);
    this.renderSavedTechConfigs(false);
  },

  // ─── Abrir Vistas Separadas de Edición ──────────────────────
  openEditStack() {
    App.navigate('edit-stack');
    this.renderEditStack();
  },

  openEditTasks() {
    App.navigate('edit-tasks');
    this.renderEditTasks();
  },

  // ─── Render Edición del Stack ──────────────────────────────
  renderEditStack() {
    const p = this.currentProject;
    const container = document.getElementById('editStackContent');
    if (!container) return;

    container.innerHTML = `
      <div class="detail-header" style="margin-bottom: 20px;">
        <button class="detail-back" onclick="Detail.openProject('${p.id}')">
          <i class="bi bi-arrow-left"></i> Volver a Detalles
        </button>
        <div class="detail-title-block">
          <div class="detail-title">Editar Stack Tecnológico</div>
          <p style="font-family:'Space Mono', monospace; font-size:0.75rem; color:var(--accent-primary);">${App.escapeHtml(p.name)}</p>
        </div>
      </div>

      <div class="card-glass-panel" style="padding:20px; margin-bottom:20px;">
        <h3 style="font-size:1rem; font-weight:700; margin-bottom:14px;"><i class="bi bi-cpu" style="color:var(--accent-primary);"></i> Configurar Nueva Sección de Stack</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-bottom:16px;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="techSection">Sección</label>
            <select class="form-control-custom" id="techSection" style="width:100%;">
              <option value="Frontend">Frontend</option>
              <option value="Backend">Backend</option>
              <option value="Database">Database</option>
              <option value="CI/CD">CI/CD</option>
              <option value="Nube">Nube</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          
          <div class="form-group tech-autocomplete-wrapper" style="margin-bottom:0; position:relative;">
            <label class="form-label" for="techSearchInput">Tecnologías (Buscar)</label>
            <input class="form-control-custom" type="text" id="techSearchInput" placeholder="Escribe y selecciona..." oninput="Detail.onTechSearchInput()" style="width:100%;" />
            <div class="tech-autocomplete-list" id="techAutocompleteList" style="display:none; position:absolute; z-index:100; width:100%; max-height:200px; overflow-y:auto; background:#2d2d2d; border:1px solid #ffffff;"></div>
          </div>
          
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="techResponsible">Responsable (Contactos)</label>
            <select class="form-control-custom" id="techResponsible" style="width:100%;">
              <option value="">-- Seleccionar responsable --</option>
              ${this.contacts.map(c => `<option value="${c.id}">${App.escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:16px;">
          <label class="form-label">Tecnologías seleccionadas</label>
          <div class="tech-tags-list" id="selectedTechsList" style="display:flex; flex-wrap:wrap; gap:6px; min-height:30px;">
            <!-- Chips dinámicos -->
          </div>
        </div>

        <div class="form-group" style="margin-bottom:16px;">
          <label class="form-label" for="techObservation">Observación / Notas</label>
          <textarea class="form-control-custom" id="techObservation" placeholder="Notas sobre el uso de estas tecnologías..." rows="2" style="width:100%;"></textarea>
        </div>

        <button class="btn-primary-custom" onclick="Detail.saveTechConfig()">
          <i class="bi bi-save"></i> Guardar Configuración de Stack
        </button>
      </div>

      <div class="card-glass-panel" style="padding:20px;">
        <h3 style="font-size:1rem; font-weight:700; margin-bottom:14px;"><i class="bi bi-list-stars" style="color:var(--accent-primary);"></i> Stack de Tecnologías Registrado</h3>
        <div id="savedTechConfigsListEdit">
          <!-- Listado dinámico con botones eliminar -->
        </div>
      </div>
    `;

    this.renderTechTags();
    this.renderSavedTechConfigs(true);
  },

  // ─── Render Edición de Tareas ──────────────────────────────
  renderEditTasks() {
    const p = this.currentProject;
    const container = document.getElementById('editTasksContent');
    if (!container) return;

    container.innerHTML = `
      <div class="detail-header" style="margin-bottom: 20px;">
        <button class="detail-back" onclick="Detail.openProject('${p.id}')">
          <i class="bi bi-arrow-left"></i> Volver a Detalles
        </button>
        <div class="detail-title-block">
          <div class="detail-title">Editar Funciones / Checklist</div>
          <p style="font-family:'Space Mono', monospace; font-size:0.75rem; color:var(--accent-primary);">${App.escapeHtml(p.name)}</p>
        </div>
        <button class="btn-primary-custom" onclick="Detail.promptAddSection()">
          <i class="bi bi-plus-lg"></i> Nueva Sección
        </button>
      </div>

      <div class="edit-tasks-grid" id="editChecklistContainer" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap:14px;">
        <!-- Secciones de checklist interactivas -->
      </div>
    `;

    this.renderChecklistSection(true);
  },

  // ─── Renderizar Checklist Seccionado ────────────────────────
  renderChecklistSection(isEdit = false) {
    const container = document.getElementById(isEdit ? 'editChecklistContainer' : 'checklistSectionContainer');
    if (!container) return;

    if (this.activeSections.length === 0) {
      if (isEdit) {
        container.innerHTML = `
          <div style="text-align:center; padding:30px; border:1px dashed var(--border); border-radius:20px; background:rgba(255,255,255,0.01); grid-column:1/-1;">
            <i class="bi bi-folder-plus" style="font-size:2rem; color:var(--text-muted); display:block; margin-bottom:12px;"></i>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:14px;">El checklist está vacío. Crea tu primera sección de trabajo para empezar a agregar tareas.</p>
            <button class="btn-primary-custom" onclick="Detail.promptAddSection()">
              <i class="bi bi-plus-lg"></i> Agregar Sección
            </button>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--text-muted); font-style:italic;">No hay secciones de checklist creadas.</div>
        `;
      }
      return;
    }

    // Agrupar tareas del proyecto por sección
    const grouped = {};
    this.activeSections.forEach(s => grouped[s] = []);

    (this.currentProject.tasks || []).forEach(t => {
      const sec = t.section || 'General';
      if (!grouped[sec]) {
        grouped[sec] = [];
        if (!this.activeSections.includes(sec)) this.activeSections.push(sec);
      }
      grouped[sec].push(t);
    });

    let html = '';
    if (!isEdit) {
      html += `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap:14px;">`;
    }

    html += this.activeSections.map(secName => {
      const secTasks = grouped[secName] || [];
      const tasksHtml = secTasks.length > 0
        ? secTasks.map(t => {
            if (isEdit) {
              return `
                <div class="checklist-item" id="task-${t.id}" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                  <input type="checkbox" id="chk-${t.id}" ${t.is_checked ? 'checked' : ''}
                         onchange="Detail.toggleTask('${t.id}', this.checked)" />
                  <label for="chk-${t.id}" style="cursor:pointer; ${t.is_checked ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${App.escapeHtml(t.description)}</label>
                  <button class="del-task-btn" onclick="Detail.deleteTask('${t.id}')" title="Eliminar" style="background:none; border:none; color:var(--text-muted); cursor:pointer; margin-left:auto;">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
              `;
            } else {
              return `
                <div class="checklist-item" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                  <input type="checkbox" disabled ${t.is_checked ? 'checked' : ''} />
                  <span style="${t.is_checked ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${App.escapeHtml(t.description)}</span>
                </div>
              `;
            }
          }).join('')
        : `<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:0.75rem;">Sin tareas en esta sección.</div>`;

      return `
        <div class="checklist-section-card" style="margin-bottom:0;">
          <div class="checklist-section-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:8px;">
            <span class="checklist-section-name" style="font-weight:700; color:var(--accent-primary);">${App.escapeHtml(secName)}</span>
            <span class="badge-status status-sin-iniciar" style="font-size:0.6rem; padding:1px 6px;">
              ${secTasks.filter(t => t.is_checked).length}/${secTasks.length} Tareas
            </span>
          </div>
          <div style="padding:4px;" id="tasks-list-${secName.replace(/\s+/g, '-')}">
            ${tasksHtml}
          </div>
          ${isEdit ? `
          <div class="add-task-row" style="display:flex; gap:6px; margin-top:8px; border-top:1px solid var(--border); padding-top:8px;">
            <input class="form-control-custom" type="text" id="newTaskInput-${secName.replace(/\s+/g, '-')}" placeholder="Agregar tarea..." style="flex:1; font-size:0.75rem; padding:4px 8px;" 
                   onkeydown="if(event.key==='Enter'){Detail.addTask('${secName}'); event.preventDefault();}" />
            <button class="btn-primary-custom" onclick="Detail.addTask('${secName}')" style="padding:4px 10px !important;">
              <i class="bi bi-plus-lg"></i>
            </button>
          </div>` : ''}
        </div>
      `;
    }).join('');

    if (!isEdit) {
      html += `</div>`;
    }

    container.innerHTML = html;
  },

  promptAddSection() {
    const name = prompt('Ingrese el nombre de la sección (ej: FRONTEND, BACKEND, BASE DE DATOS):');
    if (!name) return;
    const secName = name.trim().toUpperCase();
    if (!secName) return;

    if (!this.activeSections.includes(secName)) {
      this.activeSections.push(secName);
      this.renderChecklistSection(true);
    }
  },

  // ─── Agregar tarea a sección ──────────────────────────────
  async addTask(sectionName) {
    const inputId = `newTaskInput-${sectionName.replace(/\s+/g, '-')}`;
    const input = document.getElementById(inputId);
    const desc = input.value.trim();
    if (!desc) return;

    try {
      const task = await App.apiFetch(`/api/projects/${this.currentProject.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ description: desc, section: sectionName }),
      });

      input.value = '';

      // Añadir la tarea localmente
      if (!this.currentProject.tasks) this.currentProject.tasks = [];
      this.currentProject.tasks.push(task);

      // Recalcular progreso
      const total = this.currentProject.tasks.length;
      const completed = this.currentProject.tasks.filter(t => t.is_checked).length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      this.updateProgress(pct, completed, total);

      this.renderChecklistSection(true);
      App.toast('Tarea agregada ✓', 'success');

      // Foco en el input
      const nextInput = document.getElementById(inputId);
      if (nextInput) nextInput.focus();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  },

  // ─── Toggle checkbox ───────────────────────────────────────
  async toggleTask(taskId, checked) {
    try {
      const data = await App.apiFetch(`/api/tasks/${taskId}/toggle`, {
        method: 'PATCH',
      });

      // Actualizar datos locales
      const task = this.currentProject.tasks.find(t => t.id === taskId);
      if (task) task.is_checked = data.task.is_checked;

      const total = this.currentProject.tasks.length;
      const completed = this.currentProject.tasks.filter(t => t.is_checked).length;
      this.updateProgress(data.progress, completed, total);

      this.renderChecklistSection(true);
    } catch (err) {
      const chk = document.getElementById(`chk-${taskId}`);
      if (chk) chk.checked = !checked;
      App.toast('Error al actualizar', 'error');
    }
  },

  // ─── Eliminar tarea ────────────────────────────────────────
  async deleteTask(taskId) {
    try {
      await App.apiFetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });

      this.currentProject.tasks = this.currentProject.tasks.filter(t => t.id !== taskId);

      // Si no quedan tareas de ninguna sección
      if (this.currentProject.tasks.length === 0) {
        this.activeSections = [];
      }

      const total = this.currentProject.tasks.length;
      const completed = this.currentProject.tasks.filter(t => t.is_checked).length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      this.updateProgress(pct, completed, total);

      this.renderChecklistSection(true);
      App.toast('Tarea eliminada', 'info');
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  },

  updateProgress(pct, completed, total) {
    this.currentProject.progress = pct;
    this.currentProject.completed_tasks = completed;
    this.currentProject.total_tasks = total;

    // Actualizar porcentaje de texto
    const textEl = document.getElementById('detailProgressText');
    if (textEl) textEl.textContent = `${pct}%`;

    // Actualizar contador
    const countEl = document.getElementById('detailProgressTasksCount');
    if (countEl) countEl.textContent = `${completed} de ${total} completadas`;

    // Actualizar offset del SVG
    const svgCircle = document.getElementById('detailProgressCircleSvg');
    if (svgCircle) {
      const offset = 314 - (314 * pct) / 100;
      svgCircle.style.strokeDashoffset = offset;
    }
  },

  // ─── Tech Stack Configurator Sugerencias ──────────────────────
  onTechSearchInput() {
    const input = document.getElementById('techSearchInput');
    const query = input.value.trim().toLowerCase();
    const list = document.getElementById('techAutocompleteList');

    if (!query) {
      list.style.display = 'none';
      return;
    }

    const filtered = this.TECH_SUGGESTIONS.filter(t => t.name.toLowerCase().includes(query));

    if (filtered.length === 0) {
      list.style.display = 'none';
      return;
    }

    list.innerHTML = filtered.map(t => `
      <div class="tech-autocomplete-item" onclick="Detail.selectTech('${t.name}')" style="padding:6px 12px; cursor:pointer; color:#ffffff; display:flex; align-items:center; gap:8px;">
        <i class="${t.icon}"></i>
        <span>${App.escapeHtml(t.name)}</span>
      </div>
    `).join('');
    list.style.display = 'block';
  },

  selectTech(name) {
    if (!this.selectedTechs.includes(name)) {
      this.selectedTechs.push(name);
    }
    document.getElementById('techSearchInput').value = '';
    document.getElementById('techAutocompleteList').style.display = 'none';
    this.renderTechTags();
  },

  removeTech(name) {
    this.selectedTechs = this.selectedTechs.filter(t => t !== name);
    this.renderTechTags();
  },

  renderTechTags() {
    const container = document.getElementById('selectedTechsList');
    if (!container) return;

    if (this.selectedTechs.length === 0) {
      container.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic; padding:4px;">No hay tecnologías añadidas.</span>`;
      return;
    }

    container.innerHTML = this.selectedTechs.map(t => {
      const match = this.TECH_SUGGESTIONS.find(s => s.name === t);
      const iconClass = match ? match.icon : 'bi bi-tag';
      return `
        <span class="tech-tag" style="background:#131313; border:1px solid #ffffff; padding:4px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:6px; font-size:0.75rem; color:#ffffff;">
          <i class="${iconClass}"></i>
          ${App.escapeHtml(t)}
          <span class="remove-btn" onclick="Detail.removeTech('${t}')" style="cursor:pointer; margin-left:6px; color:var(--accent-primary);">&times;</span>
        </span>
      `;
    }).join('');
  },

  // ─── Guardar Stack ─────────────────────────────────────────
  async saveTechConfig() {
    const section = document.getElementById('techSection').value;
    const observation = document.getElementById('techObservation').value.trim();
    const responsible_contact_id = document.getElementById('techResponsible').value || null;

    if (this.selectedTechs.length === 0) {
      App.toast('Selecciona al menos una tecnología', 'error');
      return;
    }

    const body = {
      section,
      technologies: this.selectedTechs,
      observation,
      responsible_contact_id
    };

    try {
      const res = await App.apiFetch(`/api/projects/${this.currentProject.id}/tech-config`, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      App.toast('Configuración de stack guardada ✓', 'success');

      // Limpiar formulario local
      this.selectedTechs = [];
      document.getElementById('techObservation').value = '';
      document.getElementById('techResponsible').value = '';
      this.renderTechTags();

      // Recargar listado
      this.techConfigs.push(res);
      this.renderSavedTechConfigs(true);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  renderSavedTechConfigs(isEdit = false) {
    const container = document.getElementById(isEdit ? 'savedTechConfigsListEdit' : 'savedTechConfigsList');
    if (!container) return;

    if (this.techConfigs.length === 0) {
      container.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted); font-style:italic;">No hay configuraciones técnicas registradas.</p>`;
      return;
    }

    container.innerHTML = this.techConfigs.map(cfg => {
      const tagsHtml = (cfg.technologies || []).map(t => {
        const match = this.TECH_SUGGESTIONS.find(s => s.name.toLowerCase() === t.toLowerCase());
        const iconClass = match ? match.icon : 'bi bi-tag';
        return `
          <span class="tech-badge" style="background:#131313; border:1px solid #ffffff; padding:2px 6px; border-radius:4px; font-size:0.7rem; color:#ffffff; display:inline-flex; align-items:center; gap:4px;">
            <i class="${iconClass}"></i>
            ${App.escapeHtml(t)}
          </span>
        `;
      }).join('');

      const respName = cfg.responsible_name
        ? `${cfg.responsible_name} (${cfg.responsible_email})`
        : 'Sin asignar';

      return `
        <div class="tech-config-card" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
          <div class="tech-config-info" style="flex:1;">
            <div class="tech-config-row-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span class="tech-config-section-badge" style="font-weight:700; color:var(--accent-primary);">${App.escapeHtml(cfg.section)}</span>
              <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:600;"><i class="bi bi-person-circle"></i> Resp: ${App.escapeHtml(respName)}</span>
            </div>
            <div class="tech-config-item-tags" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;">
              ${tagsHtml}
            </div>
            ${cfg.observation ? `
              <div style="font-size:0.75rem; color:var(--text-muted); border-left:2px solid var(--accent-primary); padding-left:8px; margin-top:4px;">
                ${App.escapeHtml(cfg.observation)}
              </div>
            ` : ''}
          </div>
          ${isEdit ? `
          <button class="btn-danger-custom" style="padding:4px 8px; font-size:0.75rem; margin-left:12px;" onclick="Detail.deleteTechConfig('${cfg.id}')">
            <i class="bi bi-trash"></i>
          </button>` : ''}
        </div>
      `;
    }).join('');
  },

  async deleteTechConfig(id) {
    if (!confirm('¿Eliminar esta configuración de stack?')) return;

    try {
      await App.apiFetch(`/api/projects/${this.currentProject.id}/tech-config/${id}`, {
        method: 'DELETE'
      });
      App.toast('Configuración eliminada', 'info');
      this.techConfigs = this.techConfigs.filter(cfg => cfg.id !== id);
      this.renderSavedTechConfigs(true);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  // ─── Renderizadores por tipo (Herencia) ─────────────────────
  renderScriptSection(p) {
    const d = p.details || {};
    return `
    <div class="detail-section" style="margin-bottom:20px;">
      <div class="detail-section-title">
        <i class="bi bi-terminal"></i> Configuración del Script
      </div>
      <div class="info-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
        ${d.language ? `<div class="info-item">
          <div class="info-item-label">Lenguaje</div>
          <div class="info-item-value" style="display:flex;align-items:center;gap:8px;">
            <span style="background:rgba(60,255,208,0.15);color:var(--accent-primary);padding:3px 10px;border-radius:20px;font-size:0.8rem;font-weight:700;">
              ${App.escapeHtml(d.language)}
            </span>
          </div>
        </div>` : ''}
        ${d.runtime ? `<div class="info-item">
          <div class="info-item-label">Entorno de ejecución</div>
          <div class="info-item-value">${App.escapeHtml(d.runtime)}</div>
        </div>` : ''}
      </div>
      ${d.requirement ? `
      <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border);">
        <div class="info-item-label">Requerimiento</div>
        <div style="margin-top:8px; padding:14px; background:rgba(0,0,0,0.2); border-radius:10px;
                    border:1px solid var(--border); font-size:0.875rem; color:var(--text-secondary);
                    line-height:1.7; font-family:'Inter',monospace;">
          ${App.escapeHtml(d.requirement)}
        </div>
      </div>` : ''}
    </div>`;
  },

  renderInfraSection(p) {
    const d = p.details || {};
    if (Object.keys(d).length === 0) return '';

    const typeIcons = {
      saas: 'bi-cloud-fill', paas: 'bi-layers-fill',
      iaas: 'bi-server', taller: 'bi-tools', laboratorio: 'bi-flask', otro: 'bi-box',
    };

    const fields = Projects.getTypeFields(p.type);
    const filled = fields.filter(f => d[f.key]);
    if (!filled.length) return '';

    return `
    <div class="detail-section" style="margin-bottom:20px;">
      <div class="detail-section-title">
        <i class="bi ${typeIcons[p.type] || 'bi-gear'}"></i>
        Configuración ${p.type.toUpperCase()}
      </div>
      <div class="info-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; margin-top:10px;">
        ${filled.map(f => {
      const isLong = f.type === 'textarea' || (d[f.key] && d[f.key].length > 60);
      return isLong
        ? `<div class="info-item" style="grid-column:1/-1;">
                <div class="info-item-label">${f.label}</div>
                <div class="info-item-value" style="font-size:0.85rem; font-weight:400; color:var(--text-secondary); line-height:1.6; margin-top:4px;">
                  ${App.escapeHtml(d[f.key])}
                </div>
               </div>`
        : `<div class="info-item">
                <div class="info-item-label">${f.label}</div>
                <div class="info-item-value">${App.escapeHtml(d[f.key])}</div>
               </div>`;
    }).join('')}
      </div>
    </div>`;
  }
};

/* ============================================================
   AtomTask – projects.js
   Módulo de proyectos: cards, modales, filtros, CRUD
   ============================================================ */

'use strict';

const Projects = {
  allProjects: [],
  editingId: null,

  // ─── Cargar proyectos ──────────────────────────────────────
  async loadProjects() {
    const grid = document.getElementById('projectsGrid');
    grid.innerHTML = '<div class="loading-overlay" style="grid-column:1/-1;"><div class="spinner"></div></div>';
    try {
      this.allProjects = await App.apiFetch('/api/projects');
      this.renderGrid(this.allProjects);
      this.updateBadge();
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon"><i class="bi bi-exclamation-triangle"></i></div>
        <h3>Error al cargar proyectos</h3>
        <p>${App.escapeHtml(err.message)}</p>
      </div>`;
    }
  },

  updateBadge() {
    const badge = document.getElementById('headerBadge');
    if (badge) badge.textContent = `${this.allProjects.length} proyecto${this.allProjects.length !== 1 ? 's' : ''}`;
  },

  // ─── Renderizar grid ───────────────────────────────────────
  renderGrid(projects) {
    const grid = document.getElementById('projectsGrid');
    if (!projects.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon"><i class="bi bi-folder-x"></i></div>
          <h3>No hay proyectos</h3>
          <p>Crea tu primer proyecto haciendo clic en "Nuevo Proyecto"</p>
        </div>`;
      return;
    }

    grid.innerHTML = projects.map((p, idx) => this.renderCard(p, idx)).join('');

    // Inicializar tooltips
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-tippy-content]').forEach(el => {
        if (!el._tippy) {
          tippy(el, { theme: 'atomtask', placement: 'top', animation: 'scale' });
        }
      });
    });
  },

  renderCard(p, idx) {
    const progress = this.calcProgress(p);
    const total = parseInt(p.total_tasks) || 0;
    const completed = parseInt(p.completed_tasks) || 0;
    const progressColor = progress >= 80 ? 'linear-gradient(90deg,#10b981,#06b6d4)'
      : progress >= 40 ? 'linear-gradient(90deg,#3b82f6,#8b5cf6)'
      : 'linear-gradient(90deg,#f59e0b,#ef4444)';

    const deliveryLabel = p.delivery_date ? App.formatDate(p.delivery_date) : '—';
    const isOverdue = p.delivery_date && new Date(p.delivery_date) < new Date() && p.status !== 'COMPLETADO';

    return `
    <div class="project-card" data-type="${p.type}" data-id="${p.id}"
         style="animation-delay:${idx * 0.06}s"
         ondblclick="Detail.openProject('${p.id}')">

      <div class="card-body">
        <!-- Header -->
        <div class="card-header-row">
          <div>
            <div class="card-title">${App.escapeHtml(p.name)}</div>
          </div>
          <div class="card-actions">
            ${p.user_can_edit ? `
            <button class="card-action-btn" onclick="event.stopPropagation(); Projects.openEditModal('${p.id}')"
                    data-tippy-content="Editar proyecto">
              <i class="bi bi-pencil"></i>
            </button>` : ''}
            ${p.user_can_delete ? `
            <button class="card-action-btn delete" onclick="event.stopPropagation(); Projects.deleteProject('${p.id}', '${App.escapeHtml(p.name)}')"
                    data-tippy-content="Eliminar proyecto">
              <i class="bi bi-trash3"></i>
            </button>` : ''}
          </div>
        </div>

        <!-- Badges fila 1 -->
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
          <span class="badge-type badge-${p.type}"
                data-tippy-content="Tipo: ${p.type.toUpperCase()}">
            <i class="bi ${App.getTypeIcon(p.type)}"></i>
            ${p.type.toUpperCase()}
          </span>
          <span class="badge-status ${App.getStatusClass(p.status)}"
                data-tippy-content="Estado: ${p.status}">
            <i class="bi ${App.getStatusIcon(p.status)}"></i>
            ${p.status}
          </span>
          <span class="badge-importance ${App.getImportanceClass(p.importance)}"
                data-tippy-content="Importancia: ${p.importance}">
            ${App.getImportanceIcon(p.importance)} ${p.importance}
          </span>
        </div>

        <!-- Propiedades con íconos -->
        <div class="card-props">
          ${p.responsible ? `
          <span class="prop-icon" data-tippy-content="Responsable: ${App.escapeHtml(p.responsible)}">
            <i class="bi bi-person-fill"></i>
            ${App.escapeHtml(p.responsible)}
          </span>` : ''}

          ${p.client ? `
          <span class="prop-icon" data-tippy-content="Cliente: ${App.escapeHtml(p.client)}">
            <i class="bi bi-building"></i>
            ${App.escapeHtml(p.client)}
          </span>` : ''}

          <span class="prop-icon" data-tippy-content="Fecha de entrega: ${deliveryLabel}"
                style="${isOverdue ? 'color:#fca5a5; border-color:rgba(239,68,68,0.3);' : ''}">
            <i class="bi bi-calendar-event${isOverdue ? '-fill' : ''}" style="${isOverdue ? 'color:#f87171' : ''}"></i>
            ${deliveryLabel}${isOverdue ? ' ⚠️' : ''}
          </span>

          ${p.created_by_name ? `
          <span class="prop-icon" data-tippy-content="Creado por: ${App.escapeHtml(p.created_by_name)}">
            <i class="bi bi-person-badge"></i>
            ${App.escapeHtml(p.created_by_name.split(' ')[0])}
          </span>` : ''}
        </div>

        <!-- Barra de progreso -->
        <div class="progress-section">
          <div class="progress-label">
            <span data-tippy-content="${completed} de ${total} funciones completadas">
              <i class="bi bi-list-check" style="color:var(--accent-blue);"></i>
              Avance — ${completed}/${total} funciones
            </span>
            <span class="progress-pct">${progress}%</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${progress}%; background:${progressColor};"></div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="card-footer-bar" style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:0.72rem; color:var(--text-muted);">
          Creado ${App.formatDate(p.created_at)}
        </span>
        <button class="btn-secondary-custom" style="font-size:0.75rem; padding:5px 10px;"
                onclick="event.stopPropagation(); Detail.openProject('${p.id}')">
          <i class="bi bi-arrow-right-circle"></i> Ver detalle
        </button>
      </div>
    </div>`;
  },

  calcProgress(p) {
    const total = parseInt(p.total_tasks) || 0;
    const completed = parseInt(p.completed_tasks) || 0;
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  },

  // ─── Filtros ───────────────────────────────────────────────
  applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const type = document.getElementById('filterType').value;
    const status = document.getElementById('filterStatus').value;
    const importance = document.getElementById('filterImportance').value;

    const filtered = this.allProjects.filter(p => {
      const matchSearch = !search ||
        p.name.toLowerCase().includes(search) ||
        (p.client || '').toLowerCase().includes(search) ||
        (p.responsible || '').toLowerCase().includes(search);
      const matchType = !type || p.type === type;
      const matchStatus = !status || p.status === status;
      const matchImportance = !importance || p.importance === importance;
      return matchSearch && matchType && matchStatus && matchImportance;
    });

    this.renderGrid(filtered);
    const badge = document.getElementById('headerBadge');
    if (badge) badge.textContent = `${filtered.length} de ${this.allProjects.length} proyectos`;
  },

  // ─── Campos específicos por tipo ──────────────────────────
  getTypeFields(type) {
    const fields = {
      script: [
        { key: 'language', label: 'Lenguaje de programación', placeholder: 'Python, JavaScript, Bash...', type: 'text' },
        { key: 'requirement', label: 'Requerimiento / Descripción técnica', placeholder: 'Describe el requerimiento del script...', type: 'textarea' },
        { key: 'runtime', label: 'Entorno de ejecución', placeholder: 'Node 20, Python 3.11, Docker...', type: 'text' },
      ],
      saas: [
        { key: 'architecture', label: 'Arquitectura', placeholder: 'Microservicios, Monolito, Serverless...', type: 'text' },
        { key: 'hosting', label: 'Hosting / Plataforma', placeholder: 'AWS, GCP, Azure, Vercel...', type: 'text' },
        { key: 'database', label: 'Base de datos', placeholder: 'PostgreSQL, MongoDB, Firestore...', type: 'text' },
        { key: 'frontend_tech', label: 'Frontend', placeholder: 'React, Vue, Next.js...', type: 'text' },
        { key: 'backend_tech', label: 'Backend', placeholder: 'Node.js, Django, Laravel...', type: 'text' },
        { key: 'usuarios_obj', label: 'Usuarios objetivo', placeholder: 'B2B, B2C, Empresas...', type: 'text' },
        { key: 'plan_pricing', label: 'Plan / Pricing', placeholder: 'Free, Pro, Enterprise...', type: 'text' },
        { key: 'integraciones', label: 'Integraciones', placeholder: 'Stripe, Slack, Google APIs...', type: 'text' },
      ],
      paas: [
        { key: 'platform', label: 'Plataforma', placeholder: 'Kubernetes, Heroku, OpenShift...', type: 'text' },
        { key: 'runtime_env', label: 'Runtime / Entorno', placeholder: 'Docker, Buildpacks, JVM...', type: 'text' },
        { key: 'database', label: 'Base de datos', placeholder: 'RDS, Cloud SQL, Managed DB...', type: 'text' },
        { key: 'scaling', label: 'Escalabilidad', placeholder: 'Auto-scaling, Manual, Fixed...', type: 'text' },
        { key: 'ci_cd', label: 'CI/CD', placeholder: 'GitHub Actions, Jenkins, GitLab CI...', type: 'text' },
        { key: 'monitoring', label: 'Monitoreo', placeholder: 'Datadog, Prometheus, New Relic...', type: 'text' },
        { key: 'sla', label: 'SLA objetivo', placeholder: '99.9%, 99.95%...', type: 'text' },
      ],
      iaas: [
        { key: 'provider', label: 'Proveedor de nube', placeholder: 'AWS, GCP, Azure, On-premise...', type: 'text' },
        { key: 'compute', label: 'Compute / VMs', placeholder: 'EC2, GCE, VMs, Bare Metal...', type: 'text' },
        { key: 'storage', label: 'Almacenamiento', placeholder: 'S3, GCS, Blob Storage, NFS...', type: 'text' },
        { key: 'networking', label: 'Redes / VPC', placeholder: 'VPC, CDN, Load Balancer...', type: 'text' },
        { key: 'security', label: 'Seguridad', placeholder: 'IAM, WAF, VPN, SSL/TLS...', type: 'text' },
        { key: 'iac', label: 'IaC (Infraestructura como código)', placeholder: 'Terraform, Pulumi, CloudFormation...', type: 'text' },
        { key: 'backup', label: 'Backup / DR', placeholder: 'Daily snapshots, Cross-region...', type: 'text' },
        { key: 'costo_mensual', label: 'Costo mensual estimado', placeholder: '$500/mes, $1200/mes...', type: 'text' },
      ],
      taller: [
        { key: 'tema', label: 'Tema del taller', placeholder: 'Docker, React, DevOps...', type: 'text' },
        { key: 'duracion', label: 'Duración', placeholder: '4 horas, 2 días...', type: 'text' },
        { key: 'nivel', label: 'Nivel', placeholder: 'Básico, Intermedio, Avanzado', type: 'text' },
        { key: 'num_participantes', label: 'N° participantes', placeholder: '15, 30...', type: 'text' },
        { key: 'materiales', label: 'Materiales necesarios', placeholder: 'PC con Docker, VS Code...', type: 'textarea' },
      ],
      laboratorio: [
        { key: 'objetivo', label: 'Objetivo del laboratorio', placeholder: 'Experimentar con X...', type: 'textarea' },
        { key: 'herramientas', label: 'Herramientas / Stack', placeholder: 'Python, Jupyter, TensorFlow...', type: 'text' },
        { key: 'duracion', label: 'Duración estimada', placeholder: '2 semanas, 1 mes...', type: 'text' },
        { key: 'resultado_esperado', label: 'Resultado esperado', placeholder: 'Prototipo funcional, POC...', type: 'textarea' },
      ],
      otro: [
        { key: 'detalle', label: 'Detalle adicional', placeholder: 'Información relevante...', type: 'textarea' },
      ],
    };
    return fields[type] || fields.otro;
  },

  onTypeChange() {
    const type = document.getElementById('projType').value;
    const section = document.getElementById('typeSpecificFields');
    if (!type) { section.style.display = 'none'; return; }

    const fields = this.getTypeFields(type);
    const typeIcons = { script:'bi-terminal', saas:'bi-cloud', paas:'bi-layers', iaas:'bi-server', taller:'bi-tools', laboratorio:'bi-flask', otro:'bi-box' };

    section.innerHTML = `
      <div class="type-fields-section">
        <div class="type-fields-title">
          <i class="bi ${typeIcons[type] || 'bi-gear'}"></i>
          Configuración específica — ${type.toUpperCase()}
        </div>
        ${fields.map(f => `
          <div class="form-group">
            <label class="form-label" for="detail_${f.key}">${f.label}</label>
            ${f.type === 'textarea'
              ? `<textarea class="form-control-custom" id="detail_${f.key}" placeholder="${f.placeholder}" rows="2"></textarea>`
              : `<input class="form-control-custom" type="text" id="detail_${f.key}" placeholder="${f.placeholder}" />`
            }
          </div>
        `).join('')}
      </div>`;
    section.style.display = 'block';
  },

  // ─── Modal crear ───────────────────────────────────────────
  async openCreateModal() {
    this.editingId = null;
    document.getElementById('projectModalTitle').textContent = 'Nuevo Proyecto';
    document.getElementById('projectForm').reset();
    document.getElementById('projectId').value = '';
    document.getElementById('typeSpecificFields').style.display = 'none';

    // Cargar visibilidad por defecto
    try {
      const defRes = await App.apiFetch('/api/privacy/default-visibility');
      document.getElementById('projVisibility').value = defRes.default_visibility || 'PUBLIC';
    } catch (e) {
      document.getElementById('projVisibility').value = 'PUBLIC';
    }

    document.getElementById('projectModal').style.display = 'flex';
    document.getElementById('projName').focus();
  },

  // ─── Modal editar ──────────────────────────────────────────
  async openEditModal(id) {
    this.editingId = id;
    document.getElementById('projectModalTitle').textContent = 'Editar Proyecto';

    try {
      const p = await App.apiFetch(`/api/projects/${id}`);
      document.getElementById('projectId').value = p.id;
      document.getElementById('projName').value = p.name || '';
      document.getElementById('projType').value = p.type || '';
      document.getElementById('projDesc').value = p.description || '';
      document.getElementById('projClient').value = p.client || '';
      document.getElementById('projResponsible').value = p.responsible || '';
      document.getElementById('projStatus').value = p.status || 'SIN INICIAR';
      document.getElementById('projImportance').value = p.importance || 'BAJO';
      document.getElementById('projVisibility').value = p.visibility || 'PUBLIC';

      // Asignar cadenas YYYY-MM-DD directamente sin conversiones UTC/locales
      document.getElementById('projDate').value = p.delivery_date || '';
      document.getElementById('projStartDate').value = p.start_date || '';

      // Cargar campos específicos
      if (p.type) {
        this.onTypeChange();
        if (p.details) {
          const fields = this.getTypeFields(p.type);
          fields.forEach(f => {
            const el = document.getElementById(`detail_${f.key}`);
            if (el && p.details[f.key]) el.value = p.details[f.key];
          });
        }
      }

      document.getElementById('projectModal').style.display = 'flex';
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  },

  closeModal() {
    document.getElementById('projectModal').style.display = 'none';
    this.editingId = null;
  },

  closeModalOnOverlay(event) {
    if (event.target === event.currentTarget) this.closeModal();
  },

  // ─── Submit ────────────────────────────────────────────────
  async submitForm(event) {
    if (event) event.preventDefault();

    const btn = document.getElementById('projectSubmitBtn');
    const type = document.getElementById('projType').value;
    if (!type) { App.toast('Selecciona un tipo de proyecto', 'error'); return; }

    // Recoger detalles específicos
    const details = {};
    const fields = this.getTypeFields(type);
    fields.forEach(f => {
      const el = document.getElementById(`detail_${f.key}`);
      if (el) details[f.key] = el.value;
    });

    const body = {
      name: document.getElementById('projName').value,
      description: document.getElementById('projDesc').value,
      type,
      client: document.getElementById('projClient').value,
      responsible: document.getElementById('projResponsible').value,
      delivery_date: document.getElementById('projDate').value || null,
      start_date: document.getElementById('projStartDate').value || null,
      status: document.getElementById('projStatus').value,
      importance: document.getElementById('projImportance').value,
      visibility: document.getElementById('projVisibility').value || 'PUBLIC',
      details,
    };

    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Guardando...';
    btn.disabled = true;

    try {
      if (this.editingId) {
        await App.apiFetch(`/api/projects/${this.editingId}`, { method: 'PUT', body: JSON.stringify(body) });
        App.toast('Proyecto actualizado ✓', 'success');
      } else {
        await App.apiFetch('/api/projects', { method: 'POST', body: JSON.stringify(body) });
        App.toast('Proyecto creado ✓', 'success');
      }
      this.closeModal();
      await this.loadProjects();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    } finally {
      btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar Proyecto';
      btn.disabled = false;
    }
  },

  // ─── Eliminar ──────────────────────────────────────────────
  async deleteProject(id, name) {
    if (!confirm(`¿Eliminar el proyecto "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await App.apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      App.toast('Proyecto eliminado', 'info');
      await this.loadProjects();
    } catch (err) {
      App.toast(`Error: ${err.message}`, 'error');
    }
  },
};

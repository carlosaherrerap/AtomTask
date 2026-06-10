/* ============================================================
   AtomTask – app.js
   Módulo principal: navegación, auth, toast, utilidades
   ============================================================ */

'use strict';

// ─── Estado global ────────────────────────────────────────────
const AppState = {
  user: null,
  currentView: 'projects',
};

// ─── App ──────────────────────────────────────────────────────
const App = {

  async init() {
    try {
      await this.loadUser();

      // Inicializar AudioContext al hacer clic en el documento
      const unlockAudio = () => {
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            if (ctx.state === 'suspended') {
              ctx.resume();
            }
          }
        } catch (e) {
          console.error(e);
        }
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
      };
      document.addEventListener('click', unlockAudio);
      document.addEventListener('keydown', unlockAudio);

      // Cargar reuniones inicialmente para configurar el tracker y el badge
      try {
        await Calendar.loadMeetingsBackground();
      } catch (e) {
        console.error('Initial background load error:', e);
      }

      this.navigate('projects');

      // Actualizar reuniones cada 30 segundos en segundo plano para el tracker
      setInterval(async () => {
        try {
          await Calendar.loadMeetingsBackground();
        } catch (e) {
          console.error('Background meetings poll error:', e);
        }
      }, 30000);
    } catch (err) {
      console.error('Init error:', err);
      window.location.href = '/login';
    }
  },

  async loadUser() {
    const res = await fetch('/auth/me');
    if (!res.ok) throw new Error('Not authenticated');
    const data = await res.json();
    if (!data.authenticated) throw new Error('Not authenticated');
    AppState.user = data.user;
    this.renderUserPanel(data.user);
  },

  renderUserPanel(user) {
    document.getElementById('sidebarUserName').textContent = user.name;
    document.getElementById('sidebarUserEmail').textContent = user.email;

    const container = document.getElementById('sidebarAvatarContainer');
    if (user.avatar_url) {
      container.innerHTML = `<img src="${user.avatar_url}" class="user-avatar" alt="${user.name}" onerror="this.style.display='none'" />`;
    } else {
      const initials = user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      container.innerHTML = `<div class="user-avatar-placeholder">${initials}</div>`;
    }
  },

  navigate(view) {
    AppState.currentView = view;

    // Mostrar/ocultar vistas
    document.getElementById('projects-view').style.display = 'none';
    document.getElementById('detail-view').style.display = 'none';
    document.getElementById('calendar-view').style.display = 'none';
    document.getElementById('tablero-view').style.display = 'none';
    document.getElementById('privacidad-view').style.display = 'none';
    const esv = document.getElementById('edit-stack-view');
    if (esv) esv.style.display = 'none';
    const etv = document.getElementById('edit-tasks-view');
    if (etv) etv.style.display = 'none';

    // Ocultar badge si se navega a la vista de calendario
    if (view === 'calendar') {
      const badge = document.getElementById('calendar-notification-badge');
      if (badge) badge.style.display = 'none';
    }

    // Actualizar nav activo
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const headerBtn = document.getElementById('headerActionBtn');
    if (headerBtn) headerBtn.style.display = 'inline-flex';

    const views = {
      projects: {
        el: 'projects-view',
        nav: 'nav-projects',
        title: '<i class="bi bi-grid-1x2-fill"></i> Proyectos',
        action: () => {
          document.getElementById('headerActionBtn').innerHTML = '<i class="bi bi-plus-lg"></i> Nuevo Proyecto';
          document.getElementById('headerActionBtn').onclick = () => Projects.openCreateModal();
          Projects.loadProjects();
        },
      },
      tablero: {
        el: 'tablero-view',
        nav: 'nav-tablero',
        title: '<i class="bi bi-kanban"></i> Tablero',
        action: () => {
          if (headerBtn) headerBtn.style.display = 'none';
          Tablero.init();
        },
      },
      detail: {
        el: 'detail-view',
        nav: 'nav-projects',
        title: '<i class="bi bi-folder2-open"></i> Detalle del Proyecto',
        action: () => {
          document.getElementById('headerActionBtn').innerHTML = '<i class="bi bi-arrow-left"></i> Volver';
          document.getElementById('headerActionBtn').onclick = () => App.navigate('projects');
        },
      },
      'edit-stack': {
        el: 'edit-stack-view',
        nav: 'nav-projects',
        title: '<i class="bi bi-cpu-fill"></i> Editar Stack Tecnológico',
        action: () => {
          document.getElementById('headerActionBtn').innerHTML = '<i class="bi bi-arrow-left"></i> Detalle';
          document.getElementById('headerActionBtn').onclick = () => Detail.openProject(Detail.currentProject.id);
        }
      },
      'edit-tasks': {
        el: 'edit-tasks-view',
        nav: 'nav-projects',
        title: '<i class="bi bi-list-check"></i> Editar Funciones',
        action: () => {
          document.getElementById('headerActionBtn').innerHTML = '<i class="bi bi-arrow-left"></i> Detalle';
          document.getElementById('headerActionBtn').onclick = () => Detail.openProject(Detail.currentProject.id);
        }
      },
      calendar: {
        el: 'calendar-view',
        nav: 'nav-calendar',
        title: '<i class="bi bi-calendar3"></i> Calendario',
        action: () => {
          document.getElementById('headerActionBtn').innerHTML = '<i class="bi bi-plus-lg"></i> Nueva Reunión';
          document.getElementById('headerActionBtn').onclick = () => Calendar.openCreateModal();
          Calendar.init();
        },
      },
      privacidad: {
        el: 'privacidad-view',
        nav: 'nav-privacidad',
        title: '<i class="bi bi-shield-lock"></i> Privacidad',
        action: () => {
          if (headerBtn) headerBtn.style.display = 'none';
          Privacidad.init();
        },
      },
    };

    const cfg = views[view];
    if (!cfg) return;

    const el = document.getElementById(cfg.el);
    if (el) el.style.display = 'block';
    document.getElementById('headerTitle').innerHTML = cfg.title;

    const navEl = document.getElementById(cfg.nav);
    if (navEl) navEl.classList.add('active');

    cfg.action();

    // Cerrar sidebar en mobile
    if (window.innerWidth <= 768) this.closeSidebar();
  },

  filterByType(type) {
    const sel = document.getElementById('filterType');
    if (sel) {
      sel.value = type;
      Projects.applyFilters();
    }
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('mobile-open');
    overlay.style.display = sidebar.classList.contains('mobile-open') ? 'block' : 'none';
  },

  closeSidebar() {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebarOverlay').style.display = 'none';
  },

  async logout() {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  },

  // ─── Toast ──────────────────────────────────────────────────
  toast(message, type = 'info', duration = 3500, onClickCallback = null) {
    const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast-msg toast-${type}`;
    if (onClickCallback) {
      el.style.cursor = 'pointer';
      el.onclick = () => {
        onClickCallback();
        el.remove();
      };
    }
    el.innerHTML = `<i class="bi ${icons[type]}"></i> <div>${message}</div>`;
    container.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) {
        el.style.opacity = '0';
        el.style.transform = 'translateX(60px)';
        el.style.transition = 'all 0.3s ease';
        setTimeout(() => el.remove(), 300);
      }
    }, duration);
  },

  playChime() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      // Chiptune double chime
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.15); // A5
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15 + 0.25);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.55);
    } catch (e) {
      console.error('AudioContext chime failed:', e);
    }
  },

  // ─── Utilidades ─────────────────────────────────────────────
  formatDate(dateStr) {
    if (!dateStr) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year.slice(-2)}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  async apiFetch(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (res.status === 401) { window.location.href = '/login'; throw new Error('Not authenticated'); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  getImportanceClass(importance) {
    const map = {
      'BAJO': 'importance-bajo',
      'MEDIO': 'importance-medio',
      'IMPORTANTE': 'importance-importante',
      'MUY IMPORTANTE/RELEVANTE': 'importance-muy-importante',
    };
    return map[importance] || 'importance-bajo';
  },

  getImportanceIcon(importance) {
    const map = {
      'BAJO': '🔵',
      'MEDIO': '🟡',
      'IMPORTANTE': '🟠',
      'MUY IMPORTANTE/RELEVANTE': '🔴',
    };
    return map[importance] || '⚪';
  },

  getStatusClass(status) {
    const map = {
      'SIN INICIAR': 'status-sin-iniciar',
      'EN PROCESO': 'status-en-proceso',
      'STAND BY': 'status-stand-by',
      'COMPLETADO': 'status-completado',
    };
    return map[status] || 'status-sin-iniciar';
  },

  getStatusIcon(status) {
    const map = {
      'SIN INICIAR': 'bi-circle',
      'EN PROCESO': 'bi-play-circle-fill',
      'STAND BY': 'bi-pause-circle-fill',
      'COMPLETADO': 'bi-check-circle-fill',
    };
    return map[status] || 'bi-circle';
  },

  getTypeIcon(type) {
    const map = {
      script: 'bi-terminal',
      saas: 'bi-cloud-fill',
      paas: 'bi-layers-fill',
      iaas: 'bi-server',
      taller: 'bi-tools',
      laboratorio: 'bi-flask',
      otro: 'bi-box',
    };
    return map[type] || 'bi-box';
  },
};

// ─── Inicializar al cargar ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());

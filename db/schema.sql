
-- CREATE DATABASE atomtask;

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA: users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    default_project_visibility VARCHAR(50) DEFAULT 'PUBLIC' CHECK (default_project_visibility IN ('PUBLIC', 'PRIVATE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLA: projects
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('script', 'saas', 'paas', 'iaas', 'taller', 'laboratorio', 'otro')),
    client VARCHAR(255),
    responsible VARCHAR(255),
    delivery_date DATE,
    start_date DATE,
    importance VARCHAR(50) DEFAULT 'BAJO' CHECK (importance IN ('BAJO', 'MEDIO', 'IMPORTANTE', 'MUY IMPORTANTE/RELEVANTE')),
    status VARCHAR(50) DEFAULT 'SIN INICIAR' CHECK (status IN ('STAND BY', 'EN PROCESO', 'SIN INICIAR', 'REVISIÓN', 'ENTREGADO', 'COMPLETADO')),
    visibility VARCHAR(50) DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'CONTACTS', 'EXCEPT')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLA: project_tasks (checkboxes de funciones)
-- ============================================
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    section VARCHAR(255) DEFAULT 'General',
    description TEXT NOT NULL,
    is_checked BOOLEAN DEFAULT FALSE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLA: project_details (campos específicos por tipo)
-- ============================================
CREATE TABLE IF NOT EXISTS project_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    field_value TEXT,
    UNIQUE(project_id, field_key)
);

-- ============================================
-- TABLA: meetings (reuniones con Google Meet)
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_event_id VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    meet_link TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    visibility VARCHAR(50) DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLA: meeting_attendees
-- ============================================
CREATE TABLE IF NOT EXISTS meeting_attendees (
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (meeting_id, user_id)
);

-- ============================================
-- TABLA: sessions (express-session con pg)
-- ============================================
CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ============================================
-- TRIGGER: actualizar updated_at automáticamente
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ============================================
-- TABLA: project_permissions
-- ============================================
CREATE TABLE IF NOT EXISTS project_permissions (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    can_view BOOLEAN DEFAULT TRUE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (project_id, email)
);

-- ============================================
-- TABLA: session (para connect-pg-simple)
-- ============================================
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ============================================
-- TABLA: contacts
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(created_by, email)
);

-- ============================================
-- TABLA: contact_groups
-- ============================================
CREATE TABLE IF NOT EXISTS contact_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(created_by, name)
);

-- ============================================
-- TABLA: contact_group_members
-- ============================================
CREATE TABLE IF NOT EXISTS contact_group_members (
    group_id UUID REFERENCES contact_groups(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, contact_id)
);

-- ============================================
-- TABLA: project_visibility_rules
-- ============================================
CREATE TABLE IF NOT EXISTS project_visibility_rules (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    rule_type VARCHAR(50) CHECK (rule_type IN ('CONTACT', 'GROUP', 'EXCEPT_CONTACT')),
    target_id UUID NOT NULL,
    PRIMARY KEY (project_id, rule_type, target_id)
);

-- ============================================
-- TABLA: project_tech_config
-- ============================================
CREATE TABLE IF NOT EXISTS project_tech_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    section VARCHAR(100) NOT NULL,
    technologies TEXT[] NOT NULL,
    observation TEXT,
    responsible_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ÍNDICES para performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON meetings(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);
CREATE INDEX IF NOT EXISTS idx_contact_groups_created_by ON contact_groups(created_by);
CREATE INDEX IF NOT EXISTS idx_project_tech_config_project_id ON project_tech_config(project_id);

-- Confirmar creación
SELECT 'AtomTask schema creado exitosamente!' AS status;

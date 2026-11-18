import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Building2,
  FolderKanban,
  Layers,
  LogOut,
  Moon,
  Sun,
  Plus,
  Shield,
  Coins,
  ChevronDown,
  X,
} from 'lucide-react';
import { useAuth, Organization } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { onProjectsChanged } from '../services/projectEvents';

interface ProjectNavItem {
  id: string;
  name: string;
  budget: string;
}

interface ProjectNavState {
  orgId: string | null;
  status: 'loading' | 'ready' | 'error';
  items: ProjectNavItem[];
}

interface SidebarProps {
  /** Mobile off-canvas state. On desktop the sidebar is always visible and this has no effect. */
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const { user, currentOrg, organizations, switchOrganization, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);

  // The project list belongs to ONE organization (orgId). It is only shown while it matches the
  // current organization, so a previous organization's projects can never appear under a new one.
  const [nav, setNav] = useState<ProjectNavState>({ orgId: null, status: 'loading', items: [] });
  // Bumped when a page creates, edits or deletes a project, or when the user presses Retry
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => onProjectsChanged(() => setReloadKey((v) => v + 1)), []);

  const currentOrgId = currentOrg?.id ?? null;

  // Fetch the project list for the current organization. Re-runs only when the organization
  // changes or a project mutation is announced - not on every navigation.
  useEffect(() => {
    if (!currentOrgId) {
      setNav({ orgId: null, status: 'ready', items: [] });
      return;
    }
    let cancelled = false;
    // Switching organization: drop the old list immediately instead of showing it while loading
    setNav((prev) => (prev.orgId === currentOrgId ? prev : { orgId: currentOrgId, status: 'loading', items: [] }));

    api
      .get<ProjectNavItem[]>(`/projects?organizationId=${currentOrgId}`)
      .then((res) => {
        if (!cancelled) setNav({ orgId: currentOrgId, status: 'ready', items: res.data });
      })
      .catch(() => {
        if (!cancelled) setNav({ orgId: currentOrgId, status: 'error', items: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [currentOrgId, reloadKey]);

  const view: ProjectNavState =
    nav.orgId === currentOrgId ? nav : { orgId: currentOrgId, status: 'loading', items: [] };
  const projects = view.items;

  const handleOrgChange = (org: Organization) => {
    switchOrganization(org.id);
    setIsOrgDropdownOpen(false);
  };

  const handleSelectProject = (projectId: string) => {
    navigate('/projects', { state: { projectId } });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const activeProjectId = (location.state as { projectId?: string })?.projectId;

  return (
    <aside id="app-sidebar" className={`app-sidebar ${isOpen ? 'open' : ''}`} aria-label="Main navigation">
      {/* 1. Brand Logo */}
      <div className="sidebar-brand">
        <div className="nav-logo-badge">TP</div>
        <div className="brand-text">
          <span className="brand-title">Project Tracker</span>
          <span className="brand-subtitle">Multi-Tenant Platform</span>
        </div>
        <button type="button" className="sidebar-close-btn" onClick={onClose} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>

      {/* 2. Organization Tenant Switcher Card */}
      {currentOrg && (
        <div className="sidebar-org-card">
          <div
            className="org-selector-btn"
            onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
          >
            <div className="org-avatar">
              <Building2 size={18} />
            </div>
            <div className="org-info">
              <span className="org-name" title={currentOrg.name}>
                {currentOrg.name}
              </span>
              <div className="org-meta">
                <span className={`badge ${currentOrg.role === 'ADMIN' ? 'badge-admin' : 'badge-member'}`}>
                  <Shield size={10} style={{ marginRight: '3px' }} />
                  {currentOrg.role}
                </span>
              </div>
            </div>
            <ChevronDown size={14} className={`chevron ${isOrgDropdownOpen ? 'rotated' : ''}`} />
          </div>

          {isOrgDropdownOpen && (
            <div className="org-dropdown-menu">
              <div className="dropdown-header">Switch Organization</div>
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className={`dropdown-item ${org.id === currentOrg.id ? 'active' : ''}`}
                  onClick={() => handleOrgChange(org)}
                >
                  <Building2 size={14} />
                  <span className="dropdown-org-name">{org.name}</span>
                  <span className={`mini-role ${org.role === 'ADMIN' ? 'role-admin' : 'role-member'}`}>
                    {org.role}
                  </span>
                </div>
              ))}
              <div
                className="dropdown-item add-org-item"
                onClick={() => {
                  setIsOrgDropdownOpen(false);
                  navigate('/dashboard', { state: { openCreateOrg: true } });
                }}
              >
                <Plus size={14} />
                <span>+ Create Organization</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Navigation Links */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">MAIN</div>
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <Layers size={18} />
          <span>Organization Overview</span>
        </NavLink>

        <NavLink
          to="/projects"
          className={({ isActive }) => `sidebar-link ${isActive && !activeProjectId ? 'active' : ''}`}
        >
          <FolderKanban size={18} />
          <span>All Projects</span>
        </NavLink>

        {/* 4. Projects Sub-List in Current Organization */}
        <div className="nav-section-label projects-header">
          <span>PROJECTS ({view.status === 'ready' ? projects.length : '\u2026'})</span>
          {currentOrg?.role === 'ADMIN' && (
            <button
              className="btn-icon-subtle"
              title="New Project"
              onClick={() => navigate('/dashboard')}
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        <div className="sidebar-projects-list">
          {view.status === 'loading' ? (
            <div className="sidebar-empty-projects" role="status">Loading projects...</div>
          ) : view.status === 'error' ? (
            <div className="sidebar-empty-projects" role="alert">
              Could not load projects.{' '}
              <button type="button" className="sidebar-retry" onClick={() => setReloadKey((v) => v + 1)}>
                Retry
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="sidebar-empty-projects">No projects yet</div>
          ) : (
            projects.map((p) => {
              const isSelected =
                location.pathname === '/projects' && activeProjectId === p.id;
              return (
                <div
                  key={p.id}
                  className={`sidebar-project-item ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectProject(p.id)}
                  title={p.name}
                >
                  <div className="project-bullet" />
                  <span className="project-title-text">{p.name}</span>
                  <span className="project-budget-pill">
                    <Coins size={10} style={{ marginRight: '2px' }} />
                    {Number(p.budget).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </nav>

      {/* 5. Footer: Theme Toggle & User Account */}
      <div className="sidebar-footer">
        {/* Dark / Light Mode Switcher */}
        <button className="theme-toggle-btn" onClick={toggleTheme} title="Toggle Theme">
          {theme === 'dark' ? (
            <>
              <Sun size={16} className="theme-icon sun" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon size={16} className="theme-icon moon" />
              <span>Dark Mode</span>
            </>
          )}
        </button>

        {/* User Card */}
        {user && (
          <div className="user-profile-row">
            <div className="user-avatar-initials">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div className="user-text-info">
              <span className="user-full-name">
                {user.firstName} {user.lastName}
              </span>
              <span className="user-email-text">{user.email}</span>
            </div>
            <button
              className="logout-icon-btn"
              onClick={handleLogout}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

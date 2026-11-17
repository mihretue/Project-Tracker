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
} from 'lucide-react';
import { useAuth, Organization } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';

interface ProjectNavItem {
  id: string;
  name: string;
  budget: string;
}

export const Sidebar: React.FC = () => {
  const { user, currentOrg, organizations, switchOrganization, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [projects, setProjects] = useState<ProjectNavItem[]>([]);
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);

  // Fetch projects list for current organization
  useEffect(() => {
    let isMounted = true;
    const fetchOrgProjects = async () => {
      if (!currentOrg) {
        setProjects([]);
        return;
      }
      try {
        const res = await api.get<ProjectNavItem[]>(`/projects?organizationId=${currentOrg.id}`);
        if (isMounted) {
          setProjects(res.data);
        }
      } catch {
        if (isMounted) setProjects([]);
      }
    };

    void fetchOrgProjects();
    return () => {
      isMounted = false;
    };
  }, [currentOrg?.id, location.pathname]);

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
    <aside className="app-sidebar">
      {/* 1. Brand Logo */}
      <div className="sidebar-brand">
        <div className="nav-logo-badge">TP</div>
        <div className="brand-text">
          <span className="brand-title">Project Tracker</span>
          <span className="brand-subtitle">Multi-Tenant Platform</span>
        </div>
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
                  navigate('/dashboard');
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
          <span>PROJECTS ({projects.length})</span>
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
          {projects.length === 0 ? (
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

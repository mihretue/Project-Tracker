import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Layers, FolderKanban, LogIn, UserPlus, LogOut, Building2, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, currentOrg, organizations, switchOrganization, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = (): void => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/dashboard" className="nav-brand">
          <div className="nav-logo-badge">TP</div>
          <span>Tenant Project Tracker</span>
        </Link>

        {user && (
          <nav className="nav-links">
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Layers size={16} />
                <span>Organizations</span>
              </div>
            </NavLink>

            <NavLink
              to="/projects"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FolderKanban size={16} />
                <span>Projects</span>
              </div>
            </NavLink>
          </nav>
        )}

        <div className="nav-auth">
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* Organization Selector */}
              {organizations.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Building2 size={16} style={{ color: 'var(--accent-primary)' }} />
                  <select
                    className="form-input"
                    style={{
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.85rem',
                      maxWidth: '180px',
                    }}
                    value={currentOrg?.id || ''}
                    onChange={(e) => switchOrganization(e.target.value)}
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.role})
                      </option>
                    ))}
                  </select>
                  {currentOrg && (
                    <span
                      className={`badge ${
                        currentOrg.role === 'ADMIN' ? 'badge-admin' : 'badge-member'
                      }`}
                      style={{ fontSize: '0.7rem' }}
                    >
                      <Shield size={10} style={{ marginRight: '2px' }} />
                      {currentOrg.role}
                    </span>
                  )}
                </div>
              )}

              {/* User Identity */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>
                  {user.firstName} {user.lastName}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {user.email}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="btn btn-outline"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                title="Sign Out"
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <>
              <Link
                to="/login"
                className="btn btn-outline"
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
              >
                <LogIn size={15} />
                <span>Sign In</span>
              </Link>
              <Link
                to="/register"
                className="btn btn-primary"
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
              >
                <UserPlus size={15} />
                <span>Register</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

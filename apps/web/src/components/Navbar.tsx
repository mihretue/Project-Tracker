import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Layers, FolderKanban, LogIn, UserPlus } from 'lucide-react';

export const Navbar: React.FC = () => {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/dashboard" className="nav-brand">
          <div className="nav-logo-badge">TP</div>
          <span>Tenant Project Tracker</span>
        </Link>

        <nav className="nav-links">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={16} />
              <span>Organizations</span>
            </div>
          </NavLink>

          <NavLink
            to="/projects"
            className={({ isActive }) =>
              `nav-link ${isActive ? 'active' : ''}`
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FolderKanban size={16} />
              <span>Projects</span>
            </div>
          </NavLink>
        </nav>

        <div className="nav-auth">
          <Link to="/login" className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}>
            <LogIn size={15} />
            <span>Sign In</span>
          </Link>
          <Link to="/register" className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}>
            <UserPlus size={15} />
            <span>Register</span>
          </Link>
        </div>
      </div>
    </header>
  );
};

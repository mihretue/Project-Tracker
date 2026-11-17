import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  if (!user || isAuthPage) {
    return (
      <div className="auth-fullscreen">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
};

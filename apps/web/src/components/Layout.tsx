import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../context/AuthContext';
import type { LayoutOutletContext } from './SidebarToggle';

const COLLAPSED_KEY = 'sidebarCollapsed';

const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
};

/** Must match the breakpoint in index.css where the sidebar becomes an off-canvas drawer. */
const MOBILE_QUERY = '(max-width: 900px)';

export const Layout: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const [isNavOpen, setIsNavOpen] = useState(false);
  // Desktop-only: hides the sidebar entirely. Remembered across visits (best effort).
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(readCollapsed);

  const toggleSidebar = (): void => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        // Storage unavailable: the toggle still works for this visit
      }
      return next;
    });
  };
  const outletContext: LayoutOutletContext = { isSidebarCollapsed, toggleSidebar };

  // Any navigation (including picking another project on the same page) closes the drawer
  useEffect(() => {
    setIsNavOpen(false);
  }, [location.key]);

  useEffect(() => {
    if (!isNavOpen) return undefined;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIsNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    // Lock page scrolling behind the drawer (the CSS only applies this at mobile widths)
    document.body.classList.add('nav-open');

    // Growing past the mobile breakpoint leaves the drawer state behind; close it
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_QUERY) : null;
    const onChange = (e: MediaQueryListEvent): void => {
      if (!e.matches) setIsNavOpen(false);
    };
    media?.addEventListener('change', onChange);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('nav-open');
      media?.removeEventListener('change', onChange);
    };
  }, [isNavOpen]);

  if (!user || isAuthPage) {
    return (
      <div className="auth-fullscreen">
        <Outlet />
      </div>
    );
  }

  // While the drawer is open the page behind it must not be focusable or clickable
  const inertProps = isNavOpen ? ({ inert: '' } as Record<string, string>) : {};

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <header className="mobile-topbar" {...inertProps}>
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setIsNavOpen(true)}
          aria-label="Open navigation"
          aria-expanded={isNavOpen}
          aria-controls="app-sidebar"
        >
          <Menu size={22} />
        </button>
        <div className="nav-logo-badge">TP</div>
        <span className="mobile-topbar-title">Project Tracker</span>
      </header>

      {isNavOpen && <div className="sidebar-backdrop" onClick={() => setIsNavOpen(false)} aria-hidden="true" />}
      <Sidebar isOpen={isNavOpen} onClose={() => setIsNavOpen(false)} />

      <main className="content-area" {...inertProps}>
        <Outlet context={outletContext} />
      </main>
    </div>
  );
};

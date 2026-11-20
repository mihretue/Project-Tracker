import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

/** Provided by Layout through the router outlet. */
export interface LayoutOutletContext {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

/**
 * Collapses / expands the desktop sidebar. Lives in each page's breadcrumb so it stays reachable
 * while the sidebar is hidden. Renders nothing outside Layout; on mobile the drawer button in the
 * top bar is used instead (this one is hidden by CSS at that width).
 */
export const SidebarToggle: React.FC = () => {
  const layout = useOutletContext<LayoutOutletContext | undefined>();
  if (!layout) return null;

  const { isSidebarCollapsed, toggleSidebar } = layout;
  const label = isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <button
      type="button"
      className="sidebar-toggle-btn"
      onClick={toggleSidebar}
      aria-label={label}
      title={label}
      aria-expanded={!isSidebarCollapsed}
      aria-controls="app-sidebar"
    >
      {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
    </button>
  );
};

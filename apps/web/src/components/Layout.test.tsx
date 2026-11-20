import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { MemoryRouter } from '../test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Layout } from './Layout';
import { SidebarToggle } from './SidebarToggle';

const mocks = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  api: { get: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }) }));
vi.mock('../services/api', () => ({ api: mocks.api }));

const org = {
  id: 'org-1',
  name: 'Alpha Org',
  slug: 'alpha',
  role: 'ADMIN',
  createdAt: '2026-11-17T00:00:00.000Z',
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
          <Route path="/projects" element={<div>Projects page</div>} />
          <Route path="/toggle" element={<SidebarToggle />} />
        </Route>
        <Route element={<Layout />}>
          <Route path="/login" element={<div>Login page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const sidebar = (): HTMLElement => screen.getByRole('complementary', { name: 'Main navigation' });
const menuButton = (): HTMLElement => screen.getByRole('button', { name: 'Open navigation' });
const main = (): HTMLElement => screen.getByRole('main');
const isOpen = (): boolean => sidebar().classList.contains('open');

beforeEach(() => {
  mocks.api.get.mockReset();
  mocks.api.get.mockResolvedValue({ data: [] });
  mocks.auth.user = { id: 'u-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' };
  mocks.auth.currentOrg = org;
  mocks.auth.organizations = [org];
  mocks.auth.switchOrganization = vi.fn();
  mocks.auth.logout = vi.fn();
});
afterEach(() => {
  cleanup();
  document.body.classList.remove('nav-open');
});

describe('Mobile navigation drawer', () => {
  it('starts closed, with an accessible menu button wired to the sidebar', () => {
    renderAt('/dashboard');
    expect(isOpen()).toBe(false);
    const button = menuButton();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe(sidebar().id);
    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeNull();
    expect(document.querySelector('.sidebar-backdrop')).toBeNull();
    expect(main().hasAttribute('inert')).toBe(false);
  });

  it('opens from the menu button: drawer open, backdrop shown, page scroll locked, background inert', () => {
    renderAt('/dashboard');
    fireEvent.click(menuButton());

    expect(isOpen()).toBe(true);
    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.sidebar-backdrop')).not.toBeNull();
    expect(document.body.classList.contains('nav-open')).toBe(true);
    expect(main().hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.mobile-topbar')?.hasAttribute('inert')).toBe(true);
  });

  it('closes with the close button', () => {
    renderAt('/dashboard');
    fireEvent.click(menuButton());
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Close navigation' }));

    expect(isOpen()).toBe(false);
    expect(document.body.classList.contains('nav-open')).toBe(false);
    expect(main().hasAttribute('inert')).toBe(false);
  });

  it('closes when the area outside the drawer (backdrop) is clicked', () => {
    renderAt('/dashboard');
    fireEvent.click(menuButton());
    fireEvent.click(document.querySelector('.sidebar-backdrop') as HTMLElement);
    expect(isOpen()).toBe(false);
    expect(document.querySelector('.sidebar-backdrop')).toBeNull();
  });

  it('closes with the Escape key', () => {
    renderAt('/dashboard');
    fireEvent.click(menuButton());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(isOpen()).toBe(false);
  });

  it('closes after choosing a navigation item, and the page changes', async () => {
    renderAt('/dashboard');
    fireEvent.click(menuButton());
    fireEvent.click(within(sidebar()).getByRole('link', { name: /All Projects/ }));

    await waitFor(() => expect(isOpen()).toBe(false));
    expect(screen.getByText('Projects page')).not.toBeNull();
  });

  it('closes after picking a project from the sidebar list', async () => {
    mocks.api.get.mockResolvedValue({ data: [{ id: 'p-1', name: 'Core Ledger', budget: '1000.00' }] });
    renderAt('/projects');
    fireEvent.click(menuButton());
    fireEvent.click(await within(sidebar()).findByTitle('Core Ledger'));
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it('keeps the page content mounted and unchanged while the drawer is open (content does not move behind it)', () => {
    renderAt('/dashboard');
    fireEvent.click(menuButton());
    expect(screen.getByText('Dashboard page')).not.toBeNull();
    expect(main().className).toBe('content-area');
  });
});

describe('Unauthenticated and auth pages keep their own layout', () => {
  it('/login renders without the app shell, sidebar or mobile top bar', () => {
    renderAt('/login');
    expect(screen.getByText('Login page')).not.toBeNull();
    expect(document.querySelector('.auth-fullscreen')).not.toBeNull();
    expect(document.querySelector('.app-shell')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });

  it('a signed-out user gets the plain layout too', () => {
    mocks.auth.user = null;
    renderAt('/dashboard');
    expect(document.querySelector('.app-shell')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

describe('Stylesheet guard: desktop layout rules are not touched by the mobile rules', () => {
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
  const mediaStart = css.indexOf('@media (max-width: 900px)');
  const desktopCss = css.slice(0, mediaStart);
  const mobileCss = css.slice(mediaStart);

  it('the permanent 270px sidebar and content offset are still the base (desktop) rules', () => {
    expect(desktopCss).toMatch(/\.app-sidebar\s*\{[^}]*width:\s*270px/);
    expect(desktopCss).toMatch(/\.content-area\s*\{[^}]*margin-left:\s*270px/);
  });

  it('mobile-only elements are hidden by default and only revealed inside the mobile media query', () => {
    expect(desktopCss).toMatch(/\.mobile-topbar,\s*\.sidebar-close-btn,\s*\.sidebar-backdrop\s*\{\s*display:\s*none/);
    expect(mobileCss).toMatch(/\.mobile-topbar\s*\{[^}]*display:\s*flex/);
  });

  it('the drawer behaviour (off-canvas transform, no left margin) exists only in the mobile query', () => {
    expect(mobileCss).toMatch(/\.app-sidebar\s*\{[^}]*translateX\(-100%\)/);
    expect(mobileCss).toMatch(/\.content-area\s*\{[^}]*margin-left:\s*0/);
    expect(desktopCss.match(/translateX\(-100%\)/g)).toBeNull();
  });

  it('the sidebar breakpoint matches the one the layout listens to', () => {
    expect(readFileSync(resolve(__dirname, './Layout.tsx'), 'utf8')).toContain('(max-width: 900px)');
  });
});

describe('Desktop sidebar collapse', () => {
  beforeEach(() => localStorage.removeItem('sidebarCollapsed'));
  afterEach(() => localStorage.removeItem('sidebarCollapsed'));

  const shell = (): HTMLElement => sidebar().parentElement as HTMLElement;

  it('collapses and expands from the breadcrumb toggle, and remembers the choice', () => {
    renderAt('/toggle');
    expect(shell().classList.contains('sidebar-collapsed')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(shell().classList.contains('sidebar-collapsed')).toBe(true);
    expect(localStorage.getItem('sidebarCollapsed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(shell().classList.contains('sidebar-collapsed')).toBe(false);
    expect(localStorage.getItem('sidebarCollapsed')).toBe('false');
  });

  it('starts collapsed when that was the saved choice', () => {
    localStorage.setItem('sidebarCollapsed', 'true');
    renderAt('/toggle');
    expect(shell().classList.contains('sidebar-collapsed')).toBe(true);
  });
});

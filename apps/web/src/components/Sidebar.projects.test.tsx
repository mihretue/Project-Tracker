import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from '../test-utils';
import type { Organization } from '../context/AuthContext';
import { Sidebar } from './Sidebar';
import { OrganizationDashboardPage } from '../pages/OrganizationDashboardPage';

interface MockAuth {
  user: { id: string; firstName: string; lastName: string; email: string };
  currentOrg: Organization | null;
  organizations: Organization[];
  switchOrganization: ReturnType<typeof vi.fn>;
  addOrganization: ReturnType<typeof vi.fn>;
  refreshOrganizations: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  auth: {} as MockAuth,
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }) }));
vi.mock('../services/api', () => ({ api: mocks.api }));

const org = (id: string, name: string): Organization => ({
  id,
  name,
  slug: id,
  role: 'ADMIN',
  createdAt: '2026-11-17T00:00:00.000Z',
});
const orgA = org('org-a', 'Alpha Org');
const orgB = org('org-b', 'Beta Org');

interface Proj {
  id: string;
  name: string;
  description: string | null;
  budget: string;
  currency: string;
  organizationId: string;
}
const proj = (id: string, name: string, organizationId: string): Proj => ({
  id,
  name,
  description: null,
  budget: '1000.00',
  currency: 'ETB',
  organizationId,
});

/** A tiny in-memory backend so create/edit/delete really change what later GETs return. */
let store: Record<string, Proj[]>;
let nextId: number;

const installBackend = (): void => {
  mocks.api.get.mockImplementation(async (url: string) => {
    if (url.includes('/members')) return { data: [] };
    const orgId = new URL(url, 'http://x').searchParams.get('organizationId') as string;
    return { data: store[orgId].map((p) => ({ ...p })) };
  });
  mocks.api.post.mockImplementation(async (_url: string, body: { name: string; budget: string; organizationId: string }) => {
    const p = proj(`new-${nextId++}`, body.name, body.organizationId);
    p.budget = body.budget;
    store[body.organizationId].push(p);
    return { data: p };
  });
  mocks.api.patch.mockImplementation(async (url: string, body: { name: string; budget: string }) => {
    const id = url.split('/').pop();
    for (const list of Object.values(store)) {
      const p = list.find((x) => x.id === id);
      if (p) Object.assign(p, body);
    }
    return { data: {} };
  });
  mocks.api.delete.mockImplementation(async (url: string) => {
    const id = url.split('/').pop();
    for (const key of Object.keys(store)) store[key] = store[key].filter((p) => p.id !== id);
    return { data: { deleted: true } };
  });
};

const sidebar = (): HTMLElement => screen.getByRole('complementary', { name: 'Main navigation' });
const countText = (): string => within(sidebar()).getByText(/^Projects \(/).textContent ?? '';
const sidebarHas = (name: string): boolean => within(sidebar()).queryByTitle(name) !== null;

const renderWithDashboard = () =>
  render(
    <MemoryRouter>
      <Sidebar />
      <OrganizationDashboardPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  nextId = 1;
  store = {
    'org-a': [proj('a1', 'Alpha One', 'org-a'), proj('a2', 'Alpha Two', 'org-a')],
    'org-b': [proj('b1', 'Beta Only', 'org-b')],
  };
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  installBackend();
  mocks.auth.user = { id: 'u-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' };
  mocks.auth.currentOrg = orgA;
  mocks.auth.organizations = [orgA, orgB];
  mocks.auth.switchOrganization = vi.fn();
  mocks.auth.addOrganization = vi.fn();
  mocks.auth.refreshOrganizations = vi.fn().mockResolvedValue([]);
  mocks.auth.logout = vi.fn();
});
afterEach(cleanup);

describe('Sidebar project list: loading, empty and error states', () => {
  it('shows a loading state and a placeholder count, then the real count and names', async () => {
    let release: (v: unknown) => void = () => undefined;
    mocks.api.get.mockImplementation(() => new Promise((r) => (release = r)));
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(within(sidebar()).getByRole('status').textContent).toMatch(/Loading projects/);
    expect(countText()).toBe('Projects (…)');

    release({ data: store['org-a'] });
    await waitFor(() => expect(countText()).toBe('Projects (2)'));
    expect(sidebarHas('Alpha One')).toBe(true);
    expect(sidebarHas('Alpha Two')).toBe(true);
  });

  it('shows an empty state for an organization without projects', async () => {
    store['org-a'] = [];
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    await waitFor(() => expect(countText()).toBe('Projects (0)'));
    expect(within(sidebar()).getByText('No projects yet')).not.toBeNull();
  });

  it('shows an error with a working Retry instead of a misleading count', async () => {
    mocks.api.get.mockRejectedValueOnce(new Error('boom'));
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    expect((await within(sidebar()).findByRole('alert')).textContent).toMatch(/Could not load projects/);
    expect(countText()).toBe('Projects (…)');

    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(countText()).toBe('Projects (2)'));
    expect(within(sidebar()).queryByRole('alert')).toBeNull();
  });
});

describe('Sidebar stays in sync with project changes made on the dashboard', () => {
  const orgPageHas = (name: string) => screen.queryAllByText(name).length > 0;

  it('creating a project increases the count and lists the new project', async () => {
    renderWithDashboard();
    await waitFor(() => expect(countText()).toBe('Projects (2)'));
    await screen.findByText('Total Projects');

    const pageButton = screen.getAllByRole('button', { name: /new project/i }).find((b) => !sidebar().contains(b));
    fireEvent.click(pageButton as HTMLElement);
    const dialog = screen.getByRole('heading', { name: 'Create New Project' }).closest('.auth-card') as HTMLElement;
    fireEvent.change(within(dialog).getByPlaceholderText('Enterprise Core Upgrade'), { target: { value: 'Gamma Launch' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Project' }));

    await waitFor(() => expect(countText()).toBe('Projects (3)'));
    expect(sidebarHas('Gamma Launch')).toBe(true);
    // dashboard and sidebar agree
    await waitFor(() => expect(orgPageHas('Gamma Launch')).toBe(true));
    expect(screen.getByText('Total Projects').nextElementSibling?.textContent).toBe('3');
  });

  it('editing a project name updates the sidebar entry', async () => {
    renderWithDashboard();
    await waitFor(() => expect(sidebarHas('Alpha One')).toBe(true));

    fireEvent.click(await screen.findByRole('button', { name: 'Edit project Alpha One' }));
    const dialog = screen.getByRole('heading', { name: 'Edit Project' }).closest('.auth-card') as HTMLElement;
    fireEvent.change(within(dialog).getByLabelText('Project Name'), { target: { value: 'Alpha Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(sidebarHas('Alpha Renamed')).toBe(true));
    expect(sidebarHas('Alpha One')).toBe(false);
    expect(countText()).toBe('Projects (2)');
  });

  it('deleting a project decreases the count and removes it from the sidebar', async () => {
    renderWithDashboard();
    await waitFor(() => expect(countText()).toBe('Projects (2)'));

    fireEvent.click(await screen.findByRole('button', { name: 'Delete project Alpha Two' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete Project' })).getByRole('button', { name: 'Delete Project' }),
    );

    await waitFor(() => expect(countText()).toBe('Projects (1)'));
    expect(sidebarHas('Alpha Two')).toBe(false);
    expect(sidebarHas('Alpha One')).toBe(true);
  });
});

describe('Sidebar and organization switching', () => {
  const rerenderSidebar = (view: ReturnType<typeof render>) =>
    view.rerender(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

  it('switching organization replaces count and list, and never shows the previous organization while loading', async () => {
    const view = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    await waitFor(() => expect(countText()).toBe('Projects (2)'));

    // Hold back the new organization's response to observe the in-between state
    let release: (v: unknown) => void = () => undefined;
    mocks.api.get.mockImplementation(() => new Promise((r) => (release = r)));
    mocks.auth.currentOrg = orgB;
    rerenderSidebar(view);

    expect(sidebarHas('Alpha One')).toBe(false);
    expect(sidebarHas('Alpha Two')).toBe(false);
    expect(countText()).toBe('Projects (…)');
    expect(within(sidebar()).getByRole('status')).not.toBeNull();

    await act(async () => release({ data: store['org-b'] }));
    await waitFor(() => expect(countText()).toBe('Projects (1)'));
    expect(sidebarHas('Beta Only')).toBe(true);
    expect(sidebarHas('Alpha One')).toBe(false);
  });

  it('a slow response for the previous organization can never overwrite the current one', async () => {
    const resolvers: Record<string, (v: unknown) => void> = {};
    mocks.api.get.mockImplementation(
      (url: string) =>
        new Promise((r) => {
          resolvers[new URL(url, 'http://x').searchParams.get('organizationId') as string] = r;
        }),
    );
    const view = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    mocks.auth.currentOrg = orgB;
    rerenderSidebar(view);

    await act(async () => resolvers['org-b']({ data: store['org-b'] }));
    await waitFor(() => expect(countText()).toBe('Projects (1)'));
    // org A's late answer arrives after the switch
    await act(async () => resolvers['org-a']({ data: store['org-a'] }));
    expect(countText()).toBe('Projects (1)');
    expect(sidebarHas('Alpha One')).toBe(false);
    expect(sidebarHas('Beta Only')).toBe(true);
  });

  it('after a page reload (fresh mount) the persisted projects are shown for the current organization only', async () => {
    store['org-a'].push(proj('a3', 'Alpha Three', 'org-a'));
    const first = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    await waitFor(() => expect(countText()).toBe('Projects (3)'));
    first.unmount();

    mocks.auth.currentOrg = orgB;
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    await waitFor(() => expect(countText()).toBe('Projects (1)'));
    expect(sidebarHas('Beta Only')).toBe(true);
    expect(sidebarHas('Alpha Three')).toBe(false);
    // every request was scoped to the organization that was current at the time
    const urls = mocks.api.get.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(['/projects?organizationId=org-a', '/projects?organizationId=org-b']);
  });

  it('does not refetch the list on plain navigation (no duplicate requests)', async () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    await waitFor(() => expect(countText()).toBe('Projects (2)'));
    fireEvent.click(within(sidebar()).getByRole('link', { name: /All Projects/ }));
    fireEvent.click(within(sidebar()).getByRole('link', { name: /Organization Overview/ }));
    await Promise.resolve();
    expect(mocks.api.get).toHaveBeenCalledTimes(1);
  });
});

describe('Failed operations never change the sidebar', () => {
  const apiError = (status: number, message: string) => ({ isAxiosError: true, response: { status, data: { message } } });
  const projectGets = (): number => mocks.api.get.mock.calls.filter((c) => String(c[0]).startsWith('/projects')).length;
  const unchanged = (): void => {
    expect(countText()).toBe('Projects (2)');
    expect(sidebarHas('Alpha One')).toBe(true);
    expect(sidebarHas('Alpha Two')).toBe(true);
  };

  it('a rejected create keeps the count and list, shows the error in the dialog, and does not refetch', async () => {
    mocks.api.post.mockRejectedValue(apiError(400, 'Budget must be a non-negative amount'));
    renderWithDashboard();
    await waitFor(() => expect(countText()).toBe('Projects (2)'));
    await screen.findByText('Total Projects');
    const getsBefore = projectGets();

    const pageButton = screen.getAllByRole('button', { name: /new project/i }).find((b) => !sidebar().contains(b));
    fireEvent.click(pageButton as HTMLElement);
    const dialog = screen.getByRole('heading', { name: 'Create New Project' }).closest('.auth-card') as HTMLElement;
    fireEvent.change(within(dialog).getByPlaceholderText('Enterprise Core Upgrade'), { target: { value: 'Never Saved' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Project' }));

    expect(await within(dialog).findByText('Budget must be a non-negative amount')).not.toBeNull();
    expect(mocks.api.post).toHaveBeenCalledTimes(1);
    unchanged();
    expect(sidebarHas('Never Saved')).toBe(false);
    expect(projectGets()).toBe(getsBefore);
    expect(store['org-a']).toHaveLength(2);
  });

  it('a rejected edit keeps the old name in the sidebar and does not refetch', async () => {
    mocks.api.patch.mockRejectedValue(apiError(400, 'Project name must not be empty'));
    renderWithDashboard();
    await waitFor(() => expect(countText()).toBe('Projects (2)'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit project Alpha One' }));
    const getsBefore = projectGets();
    const dialog = screen.getByRole('heading', { name: 'Edit Project' }).closest('.auth-card') as HTMLElement;
    fireEvent.change(within(dialog).getByLabelText('Project Name'), { target: { value: 'Renamed But Rejected' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    expect(await within(dialog).findByText('Project name must not be empty')).not.toBeNull();
    unchanged();
    expect(sidebarHas('Renamed But Rejected')).toBe(false);
    expect(projectGets()).toBe(getsBefore);
  });

  it('a rejected delete keeps the project and the count, and does not refetch', async () => {
    mocks.api.delete.mockRejectedValue(apiError(403, 'Only organization admins can delete projects'));
    renderWithDashboard();
    await waitFor(() => expect(countText()).toBe('Projects (2)'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete project Alpha Two' }));
    const getsBefore = projectGets();
    const dialog = screen.getByRole('dialog', { name: 'Delete Project' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Project' }));

    expect(await within(dialog).findByText('Only organization admins can delete projects')).not.toBeNull();
    unchanged();
    expect(projectGets()).toBe(getsBefore);
    expect(store['org-a']).toHaveLength(2);
  });

  it('a network failure on create behaves the same: no sidebar change, plain-language error', async () => {
    mocks.api.post.mockRejectedValue({ isAxiosError: true, message: 'Network Error' });
    renderWithDashboard();
    await waitFor(() => expect(countText()).toBe('Projects (2)'));
    await screen.findByText('Total Projects');
    const pageButton = screen.getAllByRole('button', { name: /new project/i }).find((b) => !sidebar().contains(b));
    fireEvent.click(pageButton as HTMLElement);
    const dialog = screen.getByRole('heading', { name: 'Create New Project' }).closest('.auth-card') as HTMLElement;
    fireEvent.change(within(dialog).getByPlaceholderText('Enterprise Core Upgrade'), { target: { value: 'Offline Project' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Project' }));

    expect(await within(dialog).findByText(/Cannot reach the server/)).not.toBeNull();
    unchanged();
  });
});

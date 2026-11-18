import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Organization } from '../context/AuthContext';
import { OrganizationDashboardPage } from './OrganizationDashboardPage';

interface MockAuth {
  user: { id: string };
  currentOrg: Organization | null;
  organizations: Organization[];
  switchOrganization: ReturnType<typeof vi.fn>;
  addOrganization: ReturnType<typeof vi.fn>;
  refreshOrganizations: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  auth: {} as MockAuth,
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/api', () => ({ api: mocks.api }));

const adminOrg: Organization = {
  id: 'org-1',
  name: 'Abyssinia Technologies PLC',
  slug: 'abyssinia-tech',
  role: 'ADMIN',
  createdAt: '2026-11-17T00:00:00.000Z',
};
const memberOrg: Organization = { ...adminOrg, id: 'org-2', name: 'Other Org', slug: 'other-org', role: 'MEMBER' };

const members = [
  {
    id: 'm-1',
    userId: 'u-1',
    role: 'ADMIN',
    createdAt: '2026-11-17T00:00:00.000Z',
    user: { id: 'u-1', email: 'admin@abyssinia.test', firstName: 'Alice', lastName: 'Admin' },
  },
  {
    id: 'm-2',
    userId: 'u-2',
    role: 'MEMBER',
    createdAt: '2026-11-17T00:00:00.000Z',
    user: { id: 'u-2', email: 'member@abyssinia.test', firstName: 'Mark', lastName: 'Member' },
  },
];
const projects = [
  {
    id: 'p-1',
    name: 'Mobile Banking Platform',
    description: null,
    budget: '750000.00',
    currency: 'ETB',
    organizationId: 'org-1',
  },
];

const apiError = (status: number, message: string | string[]) => ({
  isAxiosError: true,
  response: { status, data: { message } },
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <OrganizationDashboardPage />
    </MemoryRouter>,
  );

/** The dialog card whose heading is `title` (works for dialogs with and without role="dialog"). */
const card = (title: string): HTMLElement => {
  const el = screen.getByRole('heading', { name: title }).closest('.auth-card');
  if (!el) throw new Error(`no dialog "${title}"`);
  return el as HTMLElement;
};
const dialogOpen = (title: string): boolean => screen.queryByRole('heading', { name: title }) !== null;
type Scope = ReturnType<typeof within>;
const page = (): Scope => within(document.body);
const click = (name: string | RegExp, scope: Scope = page()): void => {
  fireEvent.click(scope.getByRole('button', { name }));
};
const setField = (label: string | RegExp, value: string, scope: Scope = page()): void => {
  fireEvent.change(scope.getByLabelText(label), { target: { value } });
};
const projectCalls = () => mocks.api.get.mock.calls.filter((c) => String(c[0]).startsWith('/projects'));

beforeEach(() => {
  mocks.api.get.mockReset();
  mocks.api.post.mockReset();
  mocks.api.patch.mockReset();
  mocks.api.delete.mockReset();
  mocks.auth.user = { id: 'u-1' };
  mocks.auth.currentOrg = adminOrg;
  mocks.auth.organizations = [adminOrg, memberOrg];
  mocks.auth.switchOrganization = vi.fn();
  mocks.auth.addOrganization = vi.fn();
  mocks.auth.refreshOrganizations = vi.fn().mockResolvedValue([]);
  mocks.api.get.mockImplementation(async (url: string) => {
    if (url.includes('/members')) return { data: members };
    if (url.startsWith('/projects')) return { data: projects };
    throw new Error(`unexpected GET ${url}`);
  });
});
afterEach(cleanup);

describe('Organization admin actions: visibility by role', () => {
  it('an ADMIN sees edit/delete project and change-role controls', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Edit project Mobile Banking Platform' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Delete project Mobile Banking Platform' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Change role of Mark Member' })).not.toBeNull();
    expect(screen.getByRole('button', { name: /new project/i })).not.toBeNull();
  });

  it('a MEMBER sees none of the admin-only controls', async () => {
    mocks.auth.currentOrg = { ...adminOrg, role: 'MEMBER' };
    renderPage();
    await screen.findByText('Mobile Banking Platform');
    expect(screen.queryByRole('button', { name: /edit project/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete project/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /change role/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('switching to an organization where the user is a MEMBER removes the admin actions', async () => {
    const view = renderPage();
    await screen.findByRole('button', { name: /edit project/i });

    mocks.auth.currentOrg = memberOrg;
    view.rerender(
      <MemoryRouter>
        <OrganizationDashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: /edit project/i })).toBeNull());
    expect(screen.queryByRole('button', { name: /change role/i })).toBeNull();
  });
});

describe('Edit project', () => {
  it('prepopulates name and budget, sends only those fields, closes, and refreshes projects and sidebar', async () => {
    mocks.api.patch.mockResolvedValue({ data: {} });
    const changed = vi.fn();
    window.addEventListener('projects:changed', changed);
    renderPage();
    click('Edit project Mobile Banking Platform', await waitForScreen());

    const dialog = card('Edit Project');
    expect((within(dialog).getByLabelText('Project Name') as HTMLInputElement).value).toBe('Mobile Banking Platform');
    expect((within(dialog).getByLabelText(/ETB Budget/) as HTMLInputElement).value).toBe('750000.00');

    const loadsBefore = projectCalls().length;
    setField('Project Name', '  Mobile Banking v2  ', within(dialog));
    setField(/ETB Budget/, '800000.50', within(dialog));
    click('Save Changes', within(dialog));

    await waitFor(() => expect(dialogOpen('Edit Project')).toBe(false));
    expect(mocks.api.patch).toHaveBeenCalledWith('/projects/p-1', { name: 'Mobile Banking v2', budget: '800000.50' });
    expect(projectCalls().length).toBeGreaterThan(loadsBefore);
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener('projects:changed', changed);
  });

  it('rejects an invalid budget inside the dialog without calling the API', async () => {
    renderPage();
    click('Edit project Mobile Banking Platform', await waitForScreen());
    const dialog = card('Edit Project');
    setField(/ETB Budget/, '1e15', within(dialog));
    click('Save Changes', within(dialog));

    expect(within(dialog).getByRole('alert').textContent).toMatch(/Budget must be a non-negative amount/);
    expect(mocks.api.patch).not.toHaveBeenCalled();
  });

  it('shows a server failure inside the dialog, keeps it open with the typed values, and clears it on retry', async () => {
    mocks.api.patch.mockRejectedValueOnce(apiError(400, 'Project name must not be empty')).mockResolvedValueOnce({ data: {} });
    renderPage();
    click('Edit project Mobile Banking Platform', await waitForScreen());
    const dialog = card('Edit Project');
    setField('Project Name', 'Renamed', within(dialog));
    click('Save Changes', within(dialog));

    expect(await within(dialog).findByText('Project name must not be empty')).not.toBeNull();
    expect(dialogOpen('Edit Project')).toBe(true);
    expect((within(dialog).getByLabelText('Project Name') as HTMLInputElement).value).toBe('Renamed');
    // not duplicated in the page banner behind the overlay
    expect(screen.getAllByText('Project name must not be empty')).toHaveLength(1);

    click('Save Changes', within(dialog));
    await waitFor(() => expect(dialogOpen('Edit Project')).toBe(false));
    expect(mocks.api.patch).toHaveBeenCalledTimes(2);
  });

  it('does not submit twice while a request is in flight', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mocks.api.patch.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    click('Edit project Mobile Banking Platform', await waitForScreen());
    const dialog = card('Edit Project');
    click('Save Changes', within(dialog));
    const busy = within(dialog).getByRole('button', { name: 'Saving...' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(mocks.api.patch).toHaveBeenCalledTimes(1);
    resolve({ data: {} });
    await waitFor(() => expect(dialogOpen('Edit Project')).toBe(false));
  });
});

describe('Delete project', () => {
  it('asks for confirmation, warns that tasks are deleted too, and cancelling deletes nothing', async () => {
    renderPage();
    click('Delete project Mobile Banking Platform', await waitForScreen());
    const dialog = card('Delete Project');
    expect(dialog.textContent).toMatch(/Mobile Banking Platform/);
    expect(dialog.textContent).toMatch(/tasks will be permanently deleted/);

    click('Cancel', within(dialog));
    expect(dialogOpen('Delete Project')).toBe(false);
    expect(mocks.api.delete).not.toHaveBeenCalled();
  });

  it('deletes the project after confirmation, then reloads the list and notifies the sidebar', async () => {
    mocks.api.delete.mockResolvedValue({ data: { deleted: true } });
    const changed = vi.fn();
    window.addEventListener('projects:changed', changed);
    renderPage();
    click('Delete project Mobile Banking Platform', await waitForScreen());
    const loadsBefore = projectCalls().length;
    click('Delete Project', within(card('Delete Project')));

    await waitFor(() => expect(dialogOpen('Delete Project')).toBe(false));
    expect(mocks.api.delete).toHaveBeenCalledWith('/projects/p-1');
    expect(projectCalls().length).toBeGreaterThan(loadsBefore);
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener('projects:changed', changed);
  });

  it('keeps the dialog and the page state when the request fails, and shows the error inside it', async () => {
    mocks.api.delete.mockRejectedValue(apiError(403, 'Only organization admins can delete projects'));
    renderPage();
    click('Delete project Mobile Banking Platform', await waitForScreen());
    const dialog = card('Delete Project');
    click('Delete Project', within(dialog));

    expect(await within(dialog).findByText('Only organization admins can delete projects')).not.toBeNull();
    expect(dialogOpen('Delete Project')).toBe(true);
    expect(screen.getByText('Organization Projects')).not.toBeNull();
  });
});

describe('Change member role', () => {
  it('updates another member, sending only a valid role, and does not refresh own memberships', async () => {
    mocks.api.patch.mockResolvedValue({ data: {} });
    renderPage();
    click('Change role of Mark Member', await waitForScreen());
    const dialog = card('Change Member Role');
    expect((within(dialog).getByLabelText('Role') as HTMLSelectElement).value).toBe('MEMBER');
    setField('Role', 'ADMIN', within(dialog));
    click('Save Role', within(dialog));

    await waitFor(() => expect(dialogOpen('Change Member Role')).toBe(false));
    expect(mocks.api.patch).toHaveBeenCalledWith('/organizations/org-1/members/u-2', { role: 'ADMIN' });
    expect(mocks.auth.refreshOrganizations).not.toHaveBeenCalled();
  });

  it('only offers ADMIN and MEMBER', async () => {
    renderPage();
    click('Change role of Mark Member', await waitForScreen());
    const options = within(card('Change Member Role')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['MEMBER', 'ADMIN']);
  });

  it('refreshes the organization permissions when the user changes their own role', async () => {
    mocks.api.patch.mockResolvedValue({ data: {} });
    renderPage();
    click('Change role of Alice Admin', await waitForScreen());
    const dialog = card('Change Member Role');
    setField('Role', 'MEMBER', within(dialog));
    click('Save Role', within(dialog));

    await waitFor(() => expect(mocks.auth.refreshOrganizations).toHaveBeenCalledTimes(1));
    expect(mocks.api.patch).toHaveBeenCalledWith('/organizations/org-1/members/u-1', { role: 'MEMBER' });
  });

  it('shows the last-ADMIN protection as a readable error inside the dialog', async () => {
    const message =
      'An organization must always have at least one ADMIN. Promote another member to ADMIN before demoting the last one.';
    mocks.api.patch.mockRejectedValue(apiError(409, message));
    renderPage();
    click('Change role of Alice Admin', await waitForScreen());
    const dialog = card('Change Member Role');
    setField('Role', 'MEMBER', within(dialog));
    click('Save Role', within(dialog));

    expect(await within(dialog).findByText(message)).not.toBeNull();
    expect(dialogOpen('Change Member Role')).toBe(true);
    expect(mocks.auth.refreshOrganizations).not.toHaveBeenCalled();

    // closing and reopening starts without the stale error
    click('Cancel', within(dialog));
    click('Change role of Alice Admin');
    expect(within(card('Change Member Role')).queryByRole('alert')).toBeNull();
  });
});

describe('Errors render inside the add dialogs', () => {
  const openAddMember = async (): Promise<HTMLElement> => {
    click(/add member/i, await waitForScreen());
    return card('Add Organization Member');
  };

  it.each([
    ['duplicate member', apiError(409, 'User is already a member of this organization'), 'User is already a member of this organization'],
    [
      'unknown user',
      apiError(404, 'Target user not found'),
      'No registered user has that email address. Ask them to create an account first.',
    ],
  ])('%s: message appears in the dialog, which stays open with the typed email', async (_n, error, expected) => {
    mocks.api.post.mockRejectedValue(error);
    renderPage();
    const dialog = await openAddMember();
    fireEvent.change(within(dialog).getByPlaceholderText('colleague@domain.com'), {
      target: { value: 'someone@example.test' },
    });
    click('Add Member', within(dialog));

    expect(await within(dialog).findByText(expected)).not.toBeNull();
    expect(screen.getAllByText(expected)).toHaveLength(1); // not also in the page banner
    expect(dialogOpen('Add Organization Member')).toBe(true);
    expect((within(dialog).getByPlaceholderText('colleague@domain.com') as HTMLInputElement).value).toBe(
      'someone@example.test',
    );

    // close and reopen: no stale error
    click('Cancel', within(dialog));
    const reopened = await openAddMember();
    expect(within(reopened).queryByRole('alert')).toBeNull();
  });

  it('a successful add closes the dialog and reloads the members', async () => {
    mocks.api.post.mockResolvedValue({ data: {} });
    renderPage();
    const dialog = await openAddMember();
    fireEvent.change(within(dialog).getByPlaceholderText('colleague@domain.com'), {
      target: { value: 'new@example.test' },
    });
    const loads = () => mocks.api.get.mock.calls.filter((c) => String(c[0]).includes('/members')).length;
    const before = loads();
    click('Add Member', within(dialog));

    await waitFor(() => expect(dialogOpen('Add Organization Member')).toBe(false));
    expect(mocks.api.post).toHaveBeenCalledWith('/organizations/org-1/members', {
      email: 'new@example.test',
      role: 'MEMBER',
    });
    expect(loads()).toBeGreaterThan(before);
  });

  it('create project: a server validation error shows in the dialog, then a successful retry closes it', async () => {
    mocks.api.post
      .mockRejectedValueOnce(apiError(400, ['Budget must be a non-negative amount', 'name is required']))
      .mockResolvedValueOnce({ data: {} });
    renderPage();
    click(/new project/i, await waitForScreen());
    const dialog = card('Create New Project');
    fireEvent.change(within(dialog).getByPlaceholderText('Enterprise Core Upgrade'), { target: { value: 'Fresh' } });
    click('Create Project', within(dialog));

    expect(await within(dialog).findByText('Budget must be a non-negative amount. name is required')).not.toBeNull();
    expect(dialogOpen('Create New Project')).toBe(true);
    expect((within(dialog).getByPlaceholderText('Enterprise Core Upgrade') as HTMLInputElement).value).toBe('Fresh');

    click('Create Project', within(dialog));
    await waitFor(() => expect(dialogOpen('Create New Project')).toBe(false));
  });

  it('create project: an unreachable server gives a plain-language message, not a raw error', async () => {
    mocks.api.post.mockRejectedValue({ isAxiosError: true, message: 'Network Error' });
    renderPage();
    click(/new project/i, await waitForScreen());
    const dialog = card('Create New Project');
    fireEvent.change(within(dialog).getByPlaceholderText('Enterprise Core Upgrade'), { target: { value: 'Fresh' } });
    click('Create Project', within(dialog));

    expect(await within(dialog).findByText(/Cannot reach the server/)).not.toBeNull();
  });
});

/** Waits until the organization data has rendered, then returns the screen for convenience. */
async function waitForScreen(): Promise<Scope> {
  await screen.findByText('Organization Projects');
  await screen.findByText('Alice Admin', { exact: false });
  await screen.findByText('Mobile Banking Platform');
  return page();
}

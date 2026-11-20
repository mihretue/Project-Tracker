import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from '../test-utils';
import type { Organization } from '../context/AuthContext';
import { OrganizationDashboardPage } from './OrganizationDashboardPage';

interface MockAuth {
  currentOrg: Organization | null;
  organizations: Organization[];
  switchOrganization: ReturnType<typeof vi.fn>;
  addOrganization: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  auth: {} as MockAuth,
  api: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/api', () => ({ api: mocks.api }));

const memberOrg: Organization = {
  id: 'org-1',
  name: 'Abyssinia Technologies PLC',
  slug: 'abyssinia-tech',
  role: 'MEMBER',
  createdAt: '2026-11-17T00:00:00.000Z',
};

const renderPage = (state?: { openCreateOrg: boolean }) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/dashboard', state }]}>
      <OrganizationDashboardPage />
    </MemoryRouter>,
  );

const nameInput = (): HTMLInputElement =>
  screen.getByPlaceholderText('Digital Innovations LLC') as HTMLInputElement;
const openFromEmptyState = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /create an organization/i }));
};
const typeName = (value: string): void => {
  fireEvent.change(nameInput(), { target: { value } });
};
const cancel = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
};
const dialogTitle = (): HTMLElement | null => screen.queryByText('Create New Organization');

const SIMILAR_NAME_ERROR = 'An organization with a similar name already exists. Try a different name.';

describe('Create-organization dialog (no organization yet)', () => {
  beforeEach(() => {
    mocks.api.get.mockReset();
    mocks.api.post.mockReset();
    mocks.auth.currentOrg = null;
    mocks.auth.organizations = [];
    mocks.auth.switchOrganization = vi.fn();
    mocks.auth.addOrganization = vi.fn();
  });
  afterEach(cleanup);

  it('is empty the first time it opens', () => {
    renderPage();
    expect(dialogTitle()).toBeNull();
    openFromEmptyState();
    expect(dialogTitle()).not.toBeNull();
    expect(nameInput().value).toBe('');
  });

  it('clears the typed name when cancelled, so reopening starts clean', () => {
    renderPage();
    openFromEmptyState();
    typeName('Half typed organization');
    expect(nameInput().value).toBe('Half typed organization');

    cancel();
    expect(dialogTitle()).toBeNull();

    openFromEmptyState();
    expect(nameInput().value).toBe('');
  });

  it('clears a validation error when cancelled, so reopening shows no stale error', async () => {
    mocks.api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { message: 'Organization with slug already exists' } },
    });
    renderPage();
    openFromEmptyState();
    typeName('Taken Name');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(SIMILAR_NAME_ERROR)).not.toBeNull();

    cancel();
    openFromEmptyState();
    expect(screen.queryByText(SIMILAR_NAME_ERROR)).toBeNull();
    expect(nameInput().value).toBe('');
  });

  it('shows a server validation message list as one readable error, then clears it on cancel', async () => {
    mocks.api.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { message: ['slug must be shorter', 'name is required'] } },
    });
    renderPage();
    openFromEmptyState();
    typeName('x');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('slug must be shorter, name is required')).not.toBeNull();
    cancel();
    openFromEmptyState();
    expect(screen.queryByText(/slug must be shorter/)).toBeNull();
  });

  it('on success: sends only name and slug, hands the new organization to the auth context, and reopens clean', async () => {
    const created: Organization = {
      id: 'new-org',
      name: 'Acme Trading',
      slug: 'acme-trading',
      role: 'ADMIN',
      createdAt: '2026-11-18T00:00:00.000Z',
    };
    mocks.api.post.mockResolvedValueOnce({ data: created });

    renderPage();
    openFromEmptyState();
    typeName('Acme Trading');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mocks.auth.addOrganization).toHaveBeenCalledWith(created));
    expect(mocks.api.post).toHaveBeenCalledWith('/organizations', {
      name: 'Acme Trading',
      slug: 'acme-trading',
    });
    expect(dialogTitle()).toBeNull();

    openFromEmptyState();
    expect(nameInput().value).toBe('');
  });

  it('opens clean when the sidebar asks for it via navigation state, even after a previous cancel', async () => {
    renderPage({ openCreateOrg: true });

    expect(await screen.findByText('Create New Organization')).not.toBeNull();
    expect(nameInput().value).toBe('');

    typeName('leftover');
    cancel();
    openFromEmptyState();
    expect(nameInput().value).toBe('');
  });
});

describe('Create-organization dialog (user is a MEMBER of an organization)', () => {
  beforeEach(() => {
    mocks.api.get.mockReset();
    mocks.api.post.mockReset();
    mocks.api.get.mockResolvedValue({ data: [] });
    mocks.auth.currentOrg = memberOrg;
    mocks.auth.organizations = [memberOrg];
    mocks.auth.switchOrganization = vi.fn();
    mocks.auth.addOrganization = vi.fn();
  });
  afterEach(cleanup);

  it('still offers self-service creation, and the header button also resets the form', async () => {
    renderPage();
    const open = await screen.findByRole('button', { name: /new organization/i });

    fireEvent.click(open);
    typeName('Member started this');
    cancel();

    fireEvent.click(screen.getByRole('button', { name: /new organization/i }));
    expect(nameInput().value).toBe('');
  });
});

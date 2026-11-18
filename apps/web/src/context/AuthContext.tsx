import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import { fetchAllPages } from '../services/organizations';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: 'ADMIN' | 'MEMBER';
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  organizations: Organization[];
  currentOrg: Organization | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => Promise<void>;
  logout: () => void;
  switchOrganization: (orgId: string) => void;
  /** Adds a just-created organization to the selector and makes it the current one. */
  addOrganization: (org: Organization) => void;
  refreshOrganizations: () => Promise<Organization[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type OrganizationListResponse = Organization[] | { items?: Organization[]; count: number };

/** Loads every organization of the signed-in user, following the API's pagination. */
const loadAllOrganizations = (): Promise<Organization[]> =>
  fetchAllPages<Organization>(async (take, skip) => {
    const res = await api.get<OrganizationListResponse>('/organizations', { params: { take, skip } });
    return Array.isArray(res.data)
      ? { items: res.data, count: res.data.length }
      : { items: res.data.items ?? [], count: res.data.count };
  });

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(() => {
    const saved = localStorage.getItem('currentOrg');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchOrganizations = async (): Promise<Organization[]> => {
    try {
      const orgs = await loadAllOrganizations();
      setOrganizations(orgs);

      // Select first organization or retain current if still valid
      if (orgs.length > 0) {
        const fresh = currentOrg ? orgs.find((o) => o.id === currentOrg.id) : undefined;
        // Keep the current organization, but always take the server's copy so a changed role
        // (or a tampered localStorage entry) is replaced by the authoritative value.
        const next = fresh ?? orgs[0];
        if (!fresh || fresh.role !== currentOrg?.role || fresh.name !== currentOrg?.name) {
          setCurrentOrg(next);
          localStorage.setItem('currentOrg', JSON.stringify(next));
        }
      } else {
        setCurrentOrg(null);
        localStorage.removeItem('currentOrg');
      }
      return orgs;
    } catch {
      setOrganizations([]);
      return [];
    }
  };

  useEffect(() => {
    const initAuth = async (): Promise<void> => {
      if (token) {
        try {
          const res = await api.get<User>('/auth/me');
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
          await fetchOrganizations();
        } catch {
          logout();
        }
      }
      setIsLoading(false);
    };

    void initAuth();
  }, [token]);

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await api.post<{ accessToken: string; user: User }>('/auth/login', {
        email,
        password,
      });

      const { accessToken, user: loggedUser } = res.data;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(loggedUser));

      setToken(accessToken);
      setUser(loggedUser);

      // Fetch all of the user's organizations (the token was just stored for the interceptor)
      const orgs = await loadAllOrganizations();
      setOrganizations(orgs);
      if (orgs.length > 0) {
        setCurrentOrg(orgs[0]);
        localStorage.setItem('currentOrg', JSON.stringify(orgs[0]));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<void> => {
    setIsLoading(true);
    try {
      // 1. Register user
      const res = await api.post<{ accessToken: string; user: User }>('/auth/register', {
        email,
        password,
        firstName,
        lastName,
      });

      const { accessToken, user: registeredUser } = res.data;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(registeredUser));

      setToken(accessToken);
      setUser(registeredUser);

      // 2. New accounts start without an organization; the user creates one from the dashboard
      // and becomes its ADMIN.
      setOrganizations([]);
      setCurrentOrg(null);
      localStorage.removeItem('currentOrg');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentOrg');
    setToken(null);
    setUser(null);
    setOrganizations([]);
    setCurrentOrg(null);
  };

  const switchOrganization = (orgId: string): void => {
    const selected = organizations.find((o) => o.id === orgId);
    if (selected) {
      setCurrentOrg(selected);
      localStorage.setItem('currentOrg', JSON.stringify(selected));
    }
  };

  const addOrganization = (org: Organization): void => {
    setOrganizations((prev) => (prev.some((o) => o.id === org.id) ? prev : [...prev, org]));
    setCurrentOrg(org);
    localStorage.setItem('currentOrg', JSON.stringify(org));
  };

  const refreshOrganizations = async (): Promise<Organization[]> => {
    return fetchOrganizations();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        organizations,
        currentOrg,
        isLoading,
        login,
        register,
        logout,
        switchOrganization,
        addOrganization,
        refreshOrganizations,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

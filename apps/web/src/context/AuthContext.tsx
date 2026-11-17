import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

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
    orgName: string,
  ) => Promise<void>;
  logout: () => void;
  switchOrganization: (orgId: string) => void;
  refreshOrganizations: () => Promise<Organization[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
      const res = await api.get<Organization[] | { items: Organization[]; count: number }>('/organizations');
      const orgs = Array.isArray(res.data) ? res.data : res.data.items || [];
      setOrganizations(orgs);

      // Select first organization or retain current if still valid
      if (orgs.length > 0) {
        const stillValid = currentOrg && orgs.some((o) => o.id === currentOrg.id);
        if (!stillValid) {
          const defaultOrg = orgs[0];
          setCurrentOrg(defaultOrg);
          localStorage.setItem('currentOrg', JSON.stringify(defaultOrg));
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

      // Fetch user's organizations
      const orgsRes = await api.get<Organization[] | { items: Organization[]; count: number }>('/organizations', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const orgs = Array.isArray(orgsRes.data) ? orgsRes.data : orgsRes.data.items || [];
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
    orgName: string,
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

      // 2. Automatically create initial organization for this user (they become ADMIN)
      const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const orgRes = await api.post<Organization>(
        '/organizations',
        {
          name: orgName,
          slug: slug || `org-${Date.now()}`,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const initialOrg = orgRes.data;
      setOrganizations([initialOrg]);
      setCurrentOrg(initialOrg);
      localStorage.setItem('currentOrg', JSON.stringify(initialOrg));
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

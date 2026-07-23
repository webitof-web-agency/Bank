import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import { toast } from 'sonner';
import { applyBranding, extractBranding } from '../lib/branding';

const TOKEN_KEY = 'bank-auth-token';
const USER_KEY = 'bank-auth-user';
const LEGACY_TOKEN_KEY = 'webitof-auth-token';
const LEGACY_USER_KEY = 'webitof-auth-user';

const AuthContext = createContext(null);

function readToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(LEGACY_TOKEN_KEY) || '';
}

function readUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY) || window.localStorage.getItem(LEGACY_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeUser(user) {
  if (typeof window === 'undefined') return;
  if (!user) {
    window.localStorage.removeItem(USER_KEY);
    return;
  }
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Ignore quota / serialization issues.
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readToken());
  const [user, setUser] = useState(() => readUser());
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(readToken()) && !Boolean(readUser()));
  const branding = useMemo(() => extractBranding(settings || {}), [settings]);

  useEffect(() => {
    applyBranding(branding);
  }, [branding]);

  useEffect(() => {
    let mounted = true;

    if (!token) {
      setUser(null);
      writeUser(null);
      
      api.settings.getPublic()
        .then((res) => {
          if (mounted) setSettings(res.data);
        })
        .catch(() => {
          if (mounted) {
            setSettings(null);
            applyBranding(extractBranding({}));
          }
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });

      return () => {
        mounted = false;
      };
    }

    const cachedUser = readUser();
    if (cachedUser) {
      setUser(cachedUser);
    }
    setLoading(true);

    Promise.allSettled([api.auth.me(token), api.settings.get(token)])
      .then(([meResult, settingsResult]) => {
        if (!mounted) return;

        if (meResult.status === 'fulfilled') {
          setUser(meResult.value.data);
          writeUser(meResult.value.data);
        } else {
          window.localStorage.removeItem(TOKEN_KEY);
          writeUser(null);
          setToken('');
          setUser(null);
          setSettings(null);
          toast.error('Session expired. Please login again.');
          return;
        }

        if (settingsResult.status === 'fulfilled') {
          setSettings(settingsResult.value.data || null);
        } else {
          setSettings(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const actions = useMemo(() => {
    const parsePermission = (value) => {
      const text = String(value || '').trim();
      const dotIndex = text.lastIndexOf('.');
      if (dotIndex === -1) {
        return { module: text, action: '' };
      }
      return {
        module: text.slice(0, dotIndex),
        action: text.slice(dotIndex + 1)
      };
    };

    const satisfiesPermission = (granted = [], requested = '') => {
      const requestedPermission = String(requested || '').trim();
      if (!requestedPermission) return false;
      if (granted.includes(requestedPermission)) return true;

      const requestedParts = parsePermission(requestedPermission);
      if (requestedParts.action !== 'read') return false;

      return granted.some((permission) => {
        const grantedParts = parsePermission(permission);
        return grantedParts.module === requestedParts.module && ['write', 'manage'].includes(grantedParts.action);
      });
    };

    const hasPermission = (...permissions) => {
      if (!user) return false;
      if (user.isSuperAdmin) return true;
      const requestedPermissions = permissions.flat ? permissions.flat(Infinity) : permissions;
      const grantedPermissions = Array.isArray(user.permissions) ? user.permissions : [];
      return requestedPermissions.some((permission) => satisfiesPermission(grantedPermissions, permission));
    };

    return {
      login: async (identifier, password) => {
        const response = await api.auth.login({ identifier, password });
        const nextToken = response.data.token;
        window.localStorage.setItem(TOKEN_KEY, nextToken);
        writeUser(response.data.user);
        setToken(nextToken);
        setUser(response.data.user);
        toast.success('Welcome back!');
        return response.data.user;
      },
      logout: () => {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(LEGACY_TOKEN_KEY);
        writeUser(null);
        window.localStorage.removeItem(LEGACY_USER_KEY);
        setToken('');
        setUser(null);
        toast.message('Logged out');
      },
      refresh: async () => {
        if (!token) return null;
        const response = await api.auth.me(token);
        setUser(response.data);
        writeUser(response.data);
        return response.data;
      },
      refreshSettings: async () => {
        if (!token) return null;
        const response = await api.settings.get(token);
        setSettings(response.data || null);
        return response.data || null;
      },
      forgotPassword: async (identifier) => api.auth.forgotPassword({ identifier }),
      resetPassword: async (identifier, otp, password, confirmPassword) =>
        api.auth.resetPassword({ identifier, otp, password, confirmPassword }),
      changePassword: async (payload) => api.auth.changePassword(token, payload),
      updateProfile: async (payload) => {
        const response = await api.auth.updateProfile(token, payload);
        setUser(response.data);
        writeUser(response.data);
        return response.data;
      },
      deleteAvatar: async () => {
        const response = await api.auth.deleteAvatar(token);
        setUser(response.data);
        writeUser(response.data);
        return response.data;
      },
      hasPermission,
      canManageUsers: () => hasPermission('users.manage'),
      canManageEmployees: () => hasPermission('employees.write', 'users.manage'),
      canManageRoles: () => hasPermission('roles.manage'),
      canManagePermissions: () => hasPermission('permissions.manage')
    };
  }, [token, user]);

  const value = useMemo(
    () => ({
      loading,
      token,
      user,
      settings,
      branding,
      ...actions
    }),
    [actions, branding, loading, settings, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

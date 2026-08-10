import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import { toast } from 'sonner';
import { applyBranding, extractBranding } from '../lib/branding';
import { expandPermissionCodes } from '../lib/rbac';

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

function unwrapApiData(response) {
  return response?.data?.data ?? response?.data ?? null;
}

function readCachedSettings() {
  if (typeof window === 'undefined') return null;
  try {
    const cache = window.localStorage.getItem('bank_branding_cache');
    if (cache) {
      return { payload: { branding: JSON.parse(cache) } };
    }
  } catch (e) {}
  return null;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readToken());
  const [user, setUser] = useState(() => readUser());
  const [settings, setSettings] = useState(() => readCachedSettings());
  const [draftSettings, setDraftSettings] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(readToken()) && !Boolean(readUser()));
  
  // Use draftSettings if available for instant preview across the app
  const activeSettings = draftSettings || settings;
  const branding = useMemo(() => extractBranding(activeSettings || {}), [activeSettings]);

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
          if (mounted) setSettings(unwrapApiData(res));
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
          const profile = unwrapApiData(meResult.value);
          setUser(profile);
          writeUser(profile);
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
          setSettings(unwrapApiData(settingsResult.value));
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
    const hasPermission = (...permissions) => {
      if (!user) return false;
      if (user.isSuperAdmin) return true;

      const grantedPermissions = new Set(expandPermissionCodes(Array.isArray(user.permissions) ? user.permissions : []));
      const requestedPermissions = permissions.flat ? permissions.flat(Infinity) : permissions;
      const expandedRequestedPermissions = expandPermissionCodes(requestedPermissions);

      return expandedRequestedPermissions.some((permission) => grantedPermissions.has(permission));
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
        const profile = unwrapApiData(response);
        setUser(profile);
        writeUser(profile);
        return profile;
      },
      refreshSettings: async () => {
        if (!token) return null;
        const response = await api.settings.get(token);
        const nextSettings = unwrapApiData(response);
        setSettings(nextSettings);
        return nextSettings;
      },
      forgotPassword: async (identifier) => api.auth.forgotPassword({ identifier }),
      resetPassword: async (identifier, otp, password, confirmPassword) =>
        api.auth.resetPassword({ identifier, otp, password, confirmPassword }),
      changePassword: async (payload) => api.auth.changePassword(token, payload),
      updateProfile: async (payload) => {
        await api.auth.updateProfile(token, payload);
        const refreshed = await api.auth.me(token);
        const profile = unwrapApiData(refreshed);
        setUser(profile);
        writeUser(profile);
        return profile;
      },
      deleteAvatar: async () => {
        await api.auth.deleteAvatar(token);
        const refreshed = await api.auth.me(token);
        const profile = unwrapApiData(refreshed);
        setUser(profile);
        writeUser(profile);
        return profile;
      },
      hasPermission,
      canManageUsers: () => hasPermission('users.manage'),
      canManageEmployees: () => hasPermission('employees.write', 'users.manage'),
      canManageRoles: () => hasPermission('roles.manage'),
      canManagePermissions: () => hasPermission('roles.manage')
    };
  }, [token, user]);

  const value = useMemo(
    () => ({
      loading,
      token,
      user,
      settings,
      draftSettings,
      setDraftSettings,
      branding,
      ...actions
    }),
    [actions, branding, loading, settings, draftSettings, token, user]
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




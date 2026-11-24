import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ensureDeviceKeysRegistered } from '../crypto/e2eeClient';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  age: number;
  role: 'user' | 'moderator' | 'admin';
  emailVerified: boolean;
  totpEnabled: boolean;
  mfaVerified: boolean;
  status: string;
  isDevDemo: boolean;
  createdAt: number;
}

export interface UserProfile {
  displayName: string;
  gender: string;
  datingPreferences: string[];
  cityRegion: string;
  occupation: string;
  education: string;
  languages: string[];
  bio: string;
  interests: string[];
  favoriteMusic: string;
  favoriteMovies: string;
  favoriteActivities: string;
  prompts: { question: string; answer: string }[];
  photos: { id: string; url: string; order: number }[];
  voiceIntroUrl: string;
  relationshipGoal: string;
  lifestyle: Record<string, string>;
  verifiedBadge: boolean;
  blindConnectEnabled: boolean;
  onboardingStep: number;
}

export interface UserPreferences {
  minAge: number;
  maxAge: number;
  maxDistanceKm: number;
  preferredGenders: string[];
  relationshipGoals: string[];
  lifestyleFilters: Record<string, string>;
  weights: {
    values: number;
    personality: number;
    interests: number;
    goals: number;
    lifestyle: number;
  };
}

export interface PrivacyConsent {
  profileVisibility: 'everyone' | 'matches_only' | 'hidden';
  photoVisibility: 'everyone' | 'matches_only' | 'blind_only';
  showOnlineStatus: boolean;
  readReceipts: boolean;
  shareApproxLocation: boolean;
  aiProcessingConsent: boolean;
  discoveryPaused: boolean;
  notificationsEnabled: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  consent: PrivacyConsent | null;
  assessment: { completedCount: number; answers: Record<string, number> };
  loading: boolean;
  unreadNotifications: number;
  e2eeDeviceId: number | null;
  e2eeIdentityKeyB64: string | null;
  socket: Socket | null;
  darkMode: boolean;
  toggleDarkMode: () => void;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  refreshMe: () => Promise<void>;
  setAccessTokenInMemory: (token: string | null) => void;
  logout: () => Promise<void>;
  refreshNotificationsCount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [consent, setConsent] = useState<PrivacyConsent | null>(null);
  const [assessment, setAssessment] = useState<{ completedCount: number; answers: Record<string, number> }>({
    completedCount: 0,
    answers: {},
  });
  const [loading, setLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [e2eeDeviceId, setE2eeDeviceId] = useState<number | null>(null);
  const [e2eeIdentityKeyB64, setE2eeIdentityKeyB64] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  // Kept strictly in React memory (never persisted to localStorage)
  const accessTokenRef = useRef<string | null>(null);

  const setAccessTokenInMemory = useCallback((token: string | null) => {
    accessTokenRef.current = token;
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', next);
      }
      return next;
    });
  }, []);

  const apiFetch = useCallback(async (url: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set('X-Requested-With', 'BondAI-Client');
    if (accessTokenRef.current && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessTokenRef.current}`);
    }

    let res = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (res.status === 401 && !url.includes('/api/auth/refresh') && !url.includes('/api/auth/login')) {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'X-Requested-With': 'BondAI-Client' },
        credentials: 'include',
      });
      if (refreshRes.ok) {
        const refreshData = (await refreshRes.json()) as { accessToken?: string };
        if (refreshData.accessToken) {
          accessTokenRef.current = refreshData.accessToken;
          headers.set('Authorization', `Bearer ${refreshData.accessToken}`);
        }
        res = await fetch(url, { ...init, headers, credentials: 'include' });
      }
    }

    return res;
  }, []);

  const refreshNotificationsCount = useCallback(async () => {
    try {
      const res = await apiFetch('/api/safety/notifications');
      if (res.ok) {
        const data = (await res.json()) as { unreadCount: number };
        setUnreadNotifications(data.unreadCount || 0);
      }
    } catch {
      // ignore offline
    }
  }, [apiFetch]);

  const refreshMe = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      if (!res.ok) {
        setUser(null);
        setProfile(null);
        setPreferences(null);
        setConsent(null);
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setProfile(data.profile);
      setPreferences(data.preferences);
      setConsent(data.consent);
      setAssessment(data.assessment || { completedCount: 0, answers: {} });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // Initialize Signal Protocol device keys & Socket.IO when authenticated
  useEffect(() => {
    if (!user) {
      setE2eeDeviceId(null);
      setE2eeIdentityKeyB64(null);
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    let cancelled = false;
    ensureDeviceKeysRegistered(user.id, apiFetch)
      .then((info) => {
        if (!cancelled) {
          setE2eeDeviceId(info.deviceId);
          setE2eeIdentityKeyB64(info.identityKeyB64);
        }
      })
      .catch(() => {});

    refreshNotificationsCount();

    const s = io({
      withCredentials: true,
      auth: accessTokenRef.current ? { token: accessTokenRef.current } : undefined,
      reconnection: true,
      reconnectionAttempts: 10,
    });
    s.on('match:created', () => {
      refreshNotificationsCount();
    });
    s.on('e2ee:message', () => {
      refreshNotificationsCount();
    });
    s.on('blind:reveal-updated', () => {
      refreshNotificationsCount();
    });
    setSocket(s);

    return () => {
      cancelled = true;
      s.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      accessTokenRef.current = null;
      setUser(null);
      setProfile(null);
      setPreferences(null);
      setConsent(null);
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
    }
  }, [apiFetch, socket]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        preferences,
        consent,
        assessment,
        loading,
        unreadNotifications,
        e2eeDeviceId,
        e2eeIdentityKeyB64,
        socket,
        darkMode,
        toggleDarkMode,
        apiFetch,
        refreshMe,
        setAccessTokenInMemory,
        logout,
        refreshNotificationsCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

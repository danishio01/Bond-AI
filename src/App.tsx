import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppShell } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  VerifyEmailPage,
} from './pages/AuthPages';
import { OnboardingPage } from './pages/OnboardingPage';
import { QuestionnairePage } from './pages/QuestionnairePage';
import { DiscoverPage } from './pages/DiscoverPage';
import { ProfileDetailPage } from './pages/ProfileDetailPage';
import { CompatibilityReportPage } from './pages/CompatibilityReportPage';
import { MatchesPage } from './pages/MatchesPage';
import { BlindConnectPage } from './pages/BlindConnectPage';
import { MessagesPage } from './pages/MessagesPage';
import { DatePlannerPage } from './pages/DatePlannerPage';
import { GamesPage } from './pages/GamesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { EditProfilePage } from './pages/EditProfilePage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { PrivacyDashboardPage } from './pages/PrivacyDashboardPage';
import { SafetyCenterPage } from './pages/SafetyCenterPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import {
  CommunityGuidelinesPage,
  NotFoundPage,
  PrivacyPolicyPage,
  SupportPage,
  TermsOfServicePage,
} from './pages/LegalAndSupportPages';

const RouterView: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname || '/' : '/'
  );

  const navigate = useCallback((to: string) => {
    if (typeof window === 'undefined') return;
    if (to === window.location.pathname) return;
    window.history.pushState({}, '', to);
    setCurrentPath(to.split('?')[0] || '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const normalized = currentPath.length > 1 && currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;

  const isPublicRoute =
    normalized === '/' ||
    normalized === '/login' ||
    normalized === '/register' ||
    normalized === '/verify-email' ||
    normalized === '/forgot-password' ||
    normalized === '/safety' ||
    normalized === '/support' ||
    normalized === '/legal/privacy' ||
    normalized === '/legal/terms' ||
    normalized === '/legal/guidelines';

  const renderPage = () => {
    if (loading && !isPublicRoute) {
      return (
        <div className="max-w-xl mx-auto py-20 space-y-4">
          <div className="h-8 w-48 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-64 rounded-3xl bg-slate-200/80 dark:bg-slate-800/80 animate-pulse" />
        </div>
      );
    }

    // Public routes
    if (normalized === '/') return <LandingPage navigate={navigate} />;
    if (normalized === '/login') return <LoginPage navigate={navigate} />;
    if (normalized === '/register') return <RegisterPage navigate={navigate} />;
    if (normalized === '/verify-email') return <VerifyEmailPage navigate={navigate} />;
    if (normalized === '/forgot-password') return <ForgotPasswordPage navigate={navigate} />;
    if (normalized === '/safety') return <SafetyCenterPage navigate={navigate} />;
    if (normalized === '/support') return <SupportPage navigate={navigate} />;
    if (normalized === '/legal/privacy') return <PrivacyPolicyPage navigate={navigate} />;
    if (normalized === '/legal/terms') return <TermsOfServicePage navigate={navigate} />;
    if (normalized === '/legal/guidelines') return <CommunityGuidelinesPage />;

    const isProtectedRoute =
      normalized === '/onboarding' ||
      normalized === '/questionnaire' ||
      normalized === '/discover' ||
      normalized.startsWith('/profile/') ||
      normalized.startsWith('/compatibility/') ||
      normalized === '/matches' ||
      normalized === '/blind-connect' ||
      normalized === '/messages' ||
      normalized.startsWith('/messages/') ||
      normalized === '/date-planner' ||
      normalized === '/games' ||
      normalized === '/notifications' ||
      normalized === '/edit-profile' ||
      normalized === '/settings' ||
      normalized === '/privacy' ||
      normalized === '/admin';

    if (!isProtectedRoute) {
      return <NotFoundPage navigate={navigate} />;
    }

    if (!user) {
      return <LoginPage navigate={navigate} />;
    }

    if (normalized === '/onboarding') return <OnboardingPage navigate={navigate} />;
    if (normalized === '/questionnaire') return <QuestionnairePage navigate={navigate} />;
    if (normalized === '/discover') return <DiscoverPage navigate={navigate} />;
    if (normalized.startsWith('/profile/')) {
      return <ProfileDetailPage userId={normalized.replace('/profile/', '')} navigate={navigate} />;
    }
    if (normalized.startsWith('/compatibility/')) {
      return (
        <CompatibilityReportPage userId={normalized.replace('/compatibility/', '')} navigate={navigate} />
      );
    }
    if (normalized === '/matches') return <MatchesPage navigate={navigate} />;
    if (normalized === '/blind-connect') return <BlindConnectPage navigate={navigate} />;
    if (normalized === '/messages') return <MessagesPage navigate={navigate} />;
    if (normalized.startsWith('/messages/')) {
      return <MessagesPage initialMatchId={normalized.replace('/messages/', '')} navigate={navigate} />;
    }
    if (normalized === '/date-planner') return <DatePlannerPage />;
    if (normalized === '/games') return <GamesPage />;
    if (normalized === '/notifications') return <NotificationsPage navigate={navigate} />;
    if (normalized === '/edit-profile') return <EditProfilePage navigate={navigate} />;
    if (normalized === '/settings') return <AccountSettingsPage navigate={navigate} />;
    if (normalized === '/privacy') return <PrivacyDashboardPage navigate={navigate} />;
    if (normalized === '/admin') return <AdminDashboardPage />;

    return <NotFoundPage navigate={navigate} />;
  };

  return (
    <AppShell currentPath={normalized} navigate={navigate}>
      {renderPage()}
    </AppShell>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <RouterView />
    </AuthProvider>
  );
}

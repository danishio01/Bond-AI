import React from 'react';
import {
  Bell,
  CalendarHeart,
  Compass,
  EyeOff,
  Gamepad2,
  HeartHandshake,
  Lock,
  LogOut,
  MessageSquareLock,
  Moon,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OfflineIndicator, PWAInstallButton } from './PWAControls';

export interface NavProps {
  currentPath: string;
  navigate: (to: string) => void;
}

export const AppShell: React.FC<NavProps & { children: React.ReactNode }> = ({
  currentPath,
  navigate,
  children,
}) => {
  const { user, profile, unreadNotifications, darkMode, toggleDarkMode, logout } = useAuth();

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF8FC] dark:bg-[#0E0B16] text-[#1A1625] dark:text-[#F4F1FA]">
        {/* Strict 3-zone Top Bar Contract */}
        <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-[#FAF8FC]/90 dark:bg-[#0E0B16]/90 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xl font-bold tracking-tight font-display text-[#1A1625] dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFC] rounded-lg px-1"
            >
              BondAI
            </button>

            <nav
              aria-label="Primary"
              className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              <a
                href="/#how-it-works"
                onClick={(e) => {
                  if (currentPath !== '/') {
                    e.preventDefault();
                    navigate('/');
                  }
                }}
                className="hover:text-[#7C5CFC] transition-colors whitespace-nowrap shrink-0"
              >
                How It Works
              </a>
              <button
                type="button"
                onClick={() => navigate('/legal/privacy')}
                className="hover:text-[#7C5CFC] transition-colors whitespace-nowrap shrink-0"
              >
                Privacy
              </button>
              <button
                type="button"
                onClick={() => navigate('/safety')}
                className="hover:text-[#7C5CFC] transition-colors whitespace-nowrap shrink-0"
              >
                Safety
              </button>
              <button
                type="button"
                onClick={() => navigate('/support')}
                className="hover:text-[#7C5CFC] transition-colors whitespace-nowrap shrink-0"
              >
                Support
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="hover:text-[#7C5CFC] transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            </nav>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#7C5CFC] hover:bg-[#6A48F5] rounded-xl transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
              >
                Create Account
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-[#151120]/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
            <div>
              <p className="font-display text-lg font-bold text-slate-900 dark:text-white">BondAI</p>
              <p className="mt-2 text-slate-600 dark:text-slate-400 text-xs leading-relaxed">
                Real Connections. Intelligent Matches. Private by Design. Adults 18+ only.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <PWAInstallButton compact />
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  aria-label="Toggle dark mode"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-slate-900 dark:text-white">Platform</p>
              <div className="flex flex-col items-start gap-1.5 text-slate-600 dark:text-slate-400">
                <button type="button" onClick={() => navigate('/register')} className="hover:text-[#7C5CFC]">
                  Create Account
                </button>
                <button type="button" onClick={() => navigate('/login')} className="hover:text-[#7C5CFC]">
                  Sign In
                </button>
                <button type="button" onClick={() => navigate('/support')} className="hover:text-[#7C5CFC]">
                  Help &amp; Support
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-slate-900 dark:text-white">Trust &amp; Legal</p>
              <div className="flex flex-col items-start gap-1.5 text-slate-600 dark:text-slate-400">
                <button type="button" onClick={() => navigate('/legal/privacy')} className="hover:text-[#7C5CFC]">
                  Privacy Policy
                </button>
                <button type="button" onClick={() => navigate('/legal/terms')} className="hover:text-[#7C5CFC]">
                  Terms of Service
                </button>
                <button type="button" onClick={() => navigate('/legal/guidelines')} className="hover:text-[#7C5CFC]">
                  Community Guidelines
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-slate-900 dark:text-white">Safety Contact</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Questions about safety, appeals, or data rights? Reach our Trust &amp; Safety team via the Support center.
              </p>
              <button
                type="button"
                onClick={() => navigate('/safety')}
                className="text-xs font-semibold text-[#7C5CFC] hover:underline"
              >
                Visit Safety Center
              </button>
            </div>
          </div>
        </footer>
        <OfflineIndicator />
      </div>
    );
  }

  const navItems = [
    { path: '/discover', label: 'Discover', icon: Compass },
    { path: '/blind-connect', label: 'Blind Connect', icon: EyeOff },
    { path: '/matches', label: 'Matches', icon: HeartHandshake },
    { path: '/messages', label: 'Messages', icon: MessageSquareLock },
    { path: '/date-planner', label: 'Date Planner', icon: CalendarHeart },
    { path: '/games', label: 'Games', icon: Gamepad2 },
    { path: '/edit-profile', label: 'Edit Profile', icon: UserCheck },
    { path: '/privacy', label: 'Privacy', icon: Lock },
    { path: '/safety', label: 'Safety Center', icon: ShieldAlert },
    { path: '/settings', label: 'Settings', icon: Settings },
    { path: '/admin', label: 'Admin', icon: ShieldCheck },
  ];

  const mobileTabs = [
    { path: '/discover', label: 'Discover', icon: Compass },
    { path: '/blind-connect', label: 'Blind', icon: EyeOff },
    { path: '/matches', label: 'Matches', icon: HeartHandshake },
    { path: '/messages', label: 'Chat', icon: MessageSquareLock },
    { path: '/privacy', label: 'Privacy', icon: Lock },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8FC] dark:bg-[#0E0B16] text-[#1A1625] dark:text-[#F4F1FA]">
      {/* Mobile compact sticky header <= 56px */}
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-[#151120]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/discover')}
            className="text-lg font-bold tracking-tight font-display text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            BondAI
          </button>

          <div className="flex items-center gap-2">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              className="relative min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#E85D93] text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
                  {unreadNotifications}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label="Toggle color theme"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => navigate('/edit-profile')}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap"
            >
              {profile?.displayName || user.name}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto flex-1 flex gap-6 px-3 sm:px-6 py-5 pb-24 md:pb-8">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentPath === item.path || currentPath.startsWith(`${item.path}/`);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors text-left whitespace-nowrap ${
                  active
                    ? 'bg-[#7C5CFC] text-white shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1B1628]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <button
              type="button"
              onClick={() => navigate('/questionnaire')}
              className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#1B1628]"
            >
              Personality Quiz
            </button>
            <button
              type="button"
              onClick={() => navigate('/onboarding')}
              className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#1B1628]"
            >
              Onboarding Steps
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* Mobile Bottom Tab Bar (<= 64px, keeping total sticky height < 15% viewport) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 pb-safe bg-white/95 dark:bg-[#151120]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center"
      >
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          const active = currentPath === tab.path || currentPath.startsWith(`${tab.path}/`);
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
                active ? 'text-[#7C5CFC]' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <OfflineIndicator />
    </div>
  );
};

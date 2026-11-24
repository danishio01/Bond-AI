import React, { useState } from 'react';
import { CheckCircle2, Compass, FileText, HelpCircle, Lock, Scale } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const PrivacyPolicyPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => (
  <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[#7C5CFC]">Legal &amp; Data Protection</p>
      <h1 className="font-display text-3xl font-semibold">BondAI Privacy Policy</h1>
      <p className="text-xs text-slate-500">Effective Date: 2026 · Aligned with India DPDP Act 2023 &amp; GDPR Principles</p>
    </div>

    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          1. Data Fiduciary &amp; Purpose Limitation
        </h2>
        <p>
          BondAI operates as the Data Fiduciary for account, profile, and compatibility data you submit to receive personalized adult (18+) matching services. We collect only the minimum personal data strictly needed for age verification, matching, safety moderation, and account security.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          2. What Is Encrypted End-to-End vs. Processed Server-Side
        </h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Private Chat &amp; Chat Attachments:</strong> Encrypted on-device using Signal Protocol (X3DH + Double Ratchet) and WebCrypto AES-256-GCM before upload. BondAI servers store opaque ciphertext only and cannot read messages.
          </li>
          <li>
            <strong>Sensitive Identity Fields:</strong> Legal name, email address, and date of birth are encrypted at rest with AES-256-GCM field-level encryption and matched via keyed HMAC-SHA256 blind indexes.
          </li>
          <li>
            <strong>Discovery &amp; Matching Vectors:</strong> Profile bios, preferences, and personality assessment answers are processed server-side to compute compatibility scores.
          </li>
          <li>
            <strong>Optional Gemini AI Features:</strong> Only invoked after explicit opt-in consent inside your Privacy Dashboard; prompts strip email, legal name, phone, and credentials.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
          3. Data Principal Rights &amp; Retention Schedule
        </h2>
        <p>
          You may access, export (JSON), correct, pause discovery, withdraw AI consent, deactivate, or permanently delete your account at any time from the{' '}
          <button type="button" onClick={() => navigate('/privacy')} className="text-[#7C5CFC] font-semibold underline">
            Privacy Dashboard
          </button>
          . Upon permanent deletion, your profile, photos, active sessions, and Signal key bundles are purged immediately; de-identified security audit logs may be retained up to 90 days for fraud prevention.
        </p>
      </section>
    </div>
  </article>
);

export const TermsOfServicePage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => (
  <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[#7C5CFC]">Legal Agreement</p>
      <h1 className="font-display text-3xl font-semibold">Terms of Service</h1>
      <p className="text-xs text-slate-500">Adults 18+ Only · Updated 2026</p>
    </div>

    <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">1. Eligibility (18+ Strict Requirement)</h2>
        <p>
          You must be at least 18 years old and legally able to enter a binding agreement to register or use BondAI. Any account suspected of belonging to a minor is suspended immediately.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">2. Encrypted Message Key Limitations</h2>
        <p>
          Private chats use client-side Signal Protocol keys stored locally in your browser. Clearing site storage or switching browsers without backing up or re-establishing sessions means historical ciphertexts cannot be decrypted by BondAI support.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">3. Account Termination &amp; Appeals</h2>
        <p>
          Violations of our{' '}
          <button
            type="button"
            onClick={() => navigate('/legal/guidelines')}
            className="text-[#7C5CFC] font-semibold underline"
          >
            Community Guidelines
          </button>{' '}
          may result in suspension or permanent termination. Appeals can be filed through the Support center.
        </p>
      </section>
    </div>
  </article>
);

export const CommunityGuidelinesPage: React.FC = () => (
  <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[#7C5CFC]">Community Standards</p>
      <h1 className="font-display text-3xl font-semibold">Community Guidelines</h1>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[
        {
          icon: Scale,
          title: 'Consent First, Always',
          body: 'Respect Blind Connect boundaries, pace, and explicit photo reveal decisions. Harassment or pressure to reveal photos violates community rules.',
        },
        {
          icon: Lock,
          title: 'Authentic Profiles Only',
          body: 'Do not impersonate another person, misrepresent your age, or upload stolen photos. Verified badges reflect email/account integrity checks.',
        },
        {
          icon: FileText,
          title: 'Zero Financial Solicitation',
          body: 'Investment pitches, crypto schemes, gift requests, and commercial promotion are strictly banned and subject to immediate account suspension.',
        },
        {
          icon: CheckCircle2,
          title: 'Respectful Disagreement',
          body: 'Compatibility scores highlight differences to foster honest conversation. Hate speech, threats, or doxxing are prohibited.',
        },
      ].map((rule) => {
        const Icon = rule.icon;
        return (
          <div
            key={rule.title}
            className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-2"
          >
            <Icon className="w-5 h-5 text-[#7C5CFC]" />
            <h2 className="font-display text-base font-semibold">{rule.title}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{rule.body}</p>
          </div>
        );
      })}
    </div>
  </article>
);

export const SupportPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { user, apiFetch } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [topic, setTopic] = useState('Account & Verification');
  const [message, setMessage] = useState('');
  const [ticketInfo, setTicketInfo] = useState<{ ticketId: string; message: string } | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTicketInfo(null);
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/safety/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, topic, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not submit inquiry.');
        return;
      }
      setTicketInfo({ ticketId: data.ticketId, message: data.message });
      setMessage('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <p className="text-xs font-semibold text-[#7C5CFC]">Help &amp; Support</p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">How can we help?</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {[
          {
            q: 'Why can I not read old encrypted messages after switching browsers?',
            a: 'Signal Protocol keys live locally on your browser device in IndexedDB for genuine zero-access privacy. BondAI servers never hold your private decryption keys.',
          },
          {
            q: 'How does Blind Connect protect my photos?',
            a: 'Photo URLs return HTTP 403 server-side until both matched members explicitly click Approve Photo Reveal.',
          },
          {
            q: 'How do I delete or export my personal data?',
            a: 'Visit the Privacy Dashboard to download a complete JSON data export or permanently delete your account.',
          },
          {
            q: 'Can I disable AI compatibility summaries?',
            a: 'Yes. Toggle off Gemini AI processing anytime in Privacy Dashboard while keeping deterministic matching active.',
          },
        ].map((faq) => (
          <div
            key={faq.q}
            className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-5 space-y-1.5"
          >
            <p className="font-semibold text-slate-900 dark:text-white flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-[#7C5CFC] shrink-0 mt-0.5" />
              <span>{faq.q}</span>
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed pl-6">{faq.a}</p>
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 space-y-4"
      >
        <h2 className="font-display text-lg font-semibold">Contact Support or File a Grievance / Appeal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Contact Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Topic</label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
            >
              <option value="Account & Verification">Account &amp; Verification</option>
              <option value="Encrypted Chat & Safety Numbers">Encrypted Chat &amp; Safety Numbers</option>
              <option value="Privacy & DPDP Data Request">Privacy &amp; DPDP Data Request</option>
              <option value="Moderation Appeal">Moderation Appeal</option>
              <option value="Bug Report">Bug Report</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Message (10–2000 characters)</label>
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Share details of your question or request (never include passwords)..."
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        {ticketInfo && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-200">
            <span className="font-mono font-semibold">{ticketInfo.ticketId}</span> — {ticketInfo.message}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold min-h-[44px]"
          >
            {submitting ? 'Sending...' : 'Send Support Request'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/safety')}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold min-h-[44px]"
          >
            Report a Safety Issue
          </button>
        </div>
      </form>
    </div>
  );
};

export const NotFoundPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { user } = useAuth();
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-5">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#7C5CFC]/10 text-[#7C5CFC] flex items-center justify-center">
        <Compass className="w-7 h-7" />
      </div>
      <h1 className="font-display text-3xl font-semibold">404 — Page not found</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        The route you opened does not exist or has moved. Return safely to BondAI below.
      </p>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate(user ? '/discover' : '/')}
          className="px-5 py-2.5 rounded-xl bg-[#7C5CFC] text-white text-xs font-semibold min-h-[44px]"
        >
          {user ? 'Go to Discover' : 'Return Home'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/support')}
          className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold min-h-[44px]"
        >
          Help &amp; Support
        </button>
      </div>
    </div>
  );
};

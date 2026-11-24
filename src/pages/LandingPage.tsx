import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ChevronDown,
  EyeOff,
  HeartHandshake,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAControls';

const DEMO_PREVIEWS = [
  {
    name: 'Maya · 27',
    region: 'Bengaluru',
    goal: 'Long-term relationship',
    score: 91,
    photo: '/src/assets/images/demo_profile_maya_1795508793798.jpg',
    shared: ['Ceramics', 'Bookstores', 'Slow Travel'],
    summary: 'Shared values alignment (93%) · Quiet Sunday pace & creative hobbies',
  },
  {
    name: 'Arjun · 29',
    region: 'Mumbai',
    goal: 'Long-term relationship',
    score: 88,
    photo: '/src/assets/images/demo_profile_arjun_1795508794177.jpg',
    shared: ['Bookstores', 'Cooking', 'Cycling'],
    summary: 'Communication rhythm match (90%) · Curious, thoughtful, privacy-conscious',
  },
  {
    name: 'Elena · 28',
    region: 'San Francisco',
    goal: 'Intentional dating',
    score: 86,
    photo: '/src/assets/images/demo_profile_elena_1795508794861.jpg',
    shared: ['Film Photography', 'Museums', 'Hiking'],
    summary: 'Lifestyle & travel alignment (87%) · Balanced outdoors & cultural curiosity',
  },
];

const FAQS = [
  {
    q: 'What is actually end-to-end encrypted on BondAI?',
    a: 'Private match conversations, including text messages, images, and voice notes, are encrypted on your device using the Signal Protocol (X3DH + Double Ratchet) before leaving your browser. Profile discovery fields, preferences, and safety reports are processed on the server so matching and moderation work—and we disclose that distinction transparently.',
  },
  {
    q: 'How does Blind Connect protect my photos?',
    a: 'In Blind Connect mode, your profile photos and last name are withheld at the backend and media storage endpoints. Photos only become accessible after a mutual match AND explicit consent from both people. If either person declines, photos remain hidden.',
  },
  {
    q: 'How are compatibility scores calculated?',
    a: 'BondAI uses a transparent weighted model: Shared Values (25%), Personality Compatibility (25%), Interests (20%), Relationship Goals (20%), and Lifestyle Preferences (10%). Gemini AI is used only with your explicit opt-in to explain those computed dimensions—never to invent arbitrary scores or read private chats.',
  },
  {
    q: 'Who can join BondAI?',
    a: 'BondAI is strictly for adults aged 18 and older. Date-of-birth checks are enforced at registration alongside email verification, rate limiting, and optional TOTP two-factor authentication.',
  },
];

export const LandingPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const [activeDemo, setActiveDemo] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const currentDemo = DEMO_PREVIEWS[activeDemo];

  return (
    <div className="overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-[#F4EFFC] via-[#FAF8FC] to-[#FAF8FC] dark:from-[#1A1429] dark:via-[#0E0B16] dark:to-[#0E0B16] pt-10 pb-16 sm:pt-16 sm:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-semibold tracking-wide text-[#6D4AFF] dark:text-[#C4B5FD] mb-4">
              Real Connections · Intelligent Matches · Private by Design
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold tracking-tight text-slate-900 dark:text-white leading-[1.08] text-balance">
              Find someone who truly understands you.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              BondAI combines explainable values-based matchmaking, personality-first Blind Connect, and genuine Signal Protocol encrypted messaging—built for adults 18+ who refuse to trade their privacy for connection.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-[#7C5CFC] hover:bg-[#6A48F5] text-white font-semibold text-sm shadow-sm transition-colors min-h-[48px]"
              >
                Create Free Account
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-[#181422] hover:bg-white dark:hover:bg-[#221C30] text-slate-800 dark:text-slate-100 font-semibold text-sm transition-colors min-h-[48px]"
              >
                Sign In
              </button>
              <PWAInstallButton />
            </div>
            <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
              18+ Adults Only · Signal Protocol E2EE Chat · Explicit AI Opt-In
            </p>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-full min-h-[340px] rounded-3xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#181422] shadow-sm">
              <img
                src="/src/assets/images/hero_bondai_connection_1795508793267.jpg"
                alt="Two adults sharing a warm conversation over coffee in soft window light"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover min-h-[340px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 text-white">
                <p className="text-xs font-medium text-white/80">
                  Private by Design · Explainable Matchmaking
                </p>
                <p className="mt-1 font-display text-xl sm:text-2xl font-medium">
                  Thoughtful introductions before endless swiping.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Fictional Demo Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-200/70 dark:border-slate-800/70">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold text-[#E85D93] mb-2">
              Fictional Demo Preview · Sample Profiles
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white text-balance">
              See why a match makes sense before you say hello.
            </h2>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#1B1628] self-start">
            {DEMO_PREVIEWS.map((d, idx) => (
              <button
                key={d.name}
                type="button"
                onClick={() => setActiveDemo(idx)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeDemo === idx
                    ? 'bg-white dark:bg-[#2B233D] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {d.name.split(' · ')[0]}
              </button>
            ))}
          </div>
        </div>

        <motion.div
          key={currentDemo.name}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-6 sm:p-8"
        >
          <div className="lg:col-span-4 aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img
              src={currentDemo.photo}
              alt={`Fictional demo profile of ${currentDemo.name}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="lg:col-span-8 flex flex-col justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Fictional Demo Profile · {currentDemo.region} · {currentDemo.goal}
                  </p>
                  <h3 className="mt-1 font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white">
                    {currentDemo.name}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="font-mono text-2xl font-bold text-[#7C5CFC] tabular-nums">
                    {currentDemo.score}%
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Estimated alignment</p>
                </div>
              </div>

              <p className="mt-4 text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                {currentDemo.summary}
              </p>

              <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                {[
                  { label: 'Values', pct: '25%' },
                  { label: 'Personality', pct: '25%' },
                  { label: 'Interests', pct: '20%' },
                  { label: 'Goals', pct: '20%' },
                  { label: 'Lifestyle', pct: '10%' },
                ].map((w) => (
                  <div key={w.label}>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{w.label}</p>
                    <p className="mt-0.5 font-mono text-base font-semibold text-slate-900 dark:text-white tabular-nums">
                      {w.pct} weight
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Shared interests: {currentDemo.shared.join(' · ')}
              </p>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="text-sm font-semibold text-[#7C5CFC] hover:underline whitespace-nowrap"
              >
                Take the 22-question assessment →
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* How BondAI Works & Signature Blind Connect */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-200/70 dark:border-slate-800/70">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 space-y-6">
            <div>
              <p className="text-xs font-semibold text-[#6D4AFF] dark:text-[#C4B5FD]">
                01. Signature Feature · Blind Connect
              </p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white text-balance">
                Connect by values and conversation first. Reveal photos only together.
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                With Blind Connect enabled, profile photos are never transmitted to unauthorized devices—not even blurred in CSS. Talk through prompts and compatibility games first, then unlock photos only when both people explicitly consent.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <SlidersHorizontal className="w-4 h-4 text-[#7C5CFC]" />
                  <span>Explainable Scoring</span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Cosine similarity and weighted preferences you control—never opaque black-box guesswork.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Lock className="w-4 h-4 text-[#E85D93]" />
                  <span>Signal Protocol E2EE</span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Forward-secret X3DH + Double Ratchet encryption with verifiable 60-digit Safety Numbers.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <EyeOff className="w-4 h-4 text-[#7C5CFC]" />
                  <span>Zero Chat Scanning</span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Private messages are never sent to Gemini AI or readable by BondAI administrators.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <ShieldCheck className="w-4 h-4 text-[#E85D93]" />
                  <span>Consent-Led AI</span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Icebreakers, profile coaching, and public date planning require explicit opt-in with non-AI fallbacks.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220]">
              <img
                src="/src/assets/images/blind_connect_abstract_1795508793218.jpg"
                alt="Translucent lavender and rose frosted glass panels representing privacy and gradual photo reveal"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-200/70 dark:border-slate-800/70">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white text-center mb-8">
          Honest answers about privacy &amp; matchmaking
        </h2>
        <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
          {FAQS.map((item, i) => (
            <div key={item.q} className="py-4">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 text-left py-2 text-sm sm:text-base font-semibold text-slate-900 dark:text-white"
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    openFaq === i ? 'rotate-180 text-[#7C5CFC]' : 'text-slate-400'
                  }`}
                />
              </button>
              {openFaq === i && (
                <p className="pt-2 pb-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.a}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-[#7C5CFC] hover:bg-[#6A48F5] text-white font-semibold text-sm transition-colors"
          >
            <HeartHandshake className="w-4 h-4" />
            Join BondAI (18+ Only)
          </button>
        </div>
      </section>
    </div>
  );
};

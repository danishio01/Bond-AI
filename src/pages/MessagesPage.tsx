import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  EyeOff,
  Flag,
  Image as ImageIcon,
  Lock,
  Mic,
  Paperclip,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import {
  computeSafetyNumber,
  decryptAttachmentOnDevice,
  decryptEnvelope,
  encryptAttachmentOnDevice,
  encryptPayloadForDevices,
  type DecryptedPayload,
  type RemoteDeviceBundle,
} from '../crypto/e2eeClient';
import { useAuth } from '../context/AuthContext';
import type { MatchSummary } from './MatchesPage';

interface DecryptedMessageItem {
  id: string;
  clientMsgId: string;
  senderId: string;
  replyToId: string;
  payload: DecryptedPayload | null;
  identityChanged: boolean;
  createdAt: number;
  readAt: number;
  expiresAt: number;
  attachmentObjectUrl?: string;
}

const EMOJI_PALETTE = ['😊', '💜', '✨', '☕', '🌿', '🎧', '📚', '🙌', '😄', '🌙'];
const ICEBREAKER_CATEGORIES = [
  'Thoughtful',
  'Funny',
  'Casual',
  'Creative',
  'Travel-related',
  'Personality-based',
] as const;

export const MessagesPage: React.FC<{ initialMatchId?: string; navigate: (to: string) => void }> = ({
  initialMatchId,
  navigate,
}) => {
  const { user, consent, e2eeDeviceId, socket, apiFetch } = useAuth();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<string>(initialMatchId || '');
  const [partnerBundles, setPartnerBundles] = useState<RemoteDeviceBundle[]>([]);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [messages, setMessages] = useState<DecryptedMessageItem[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [identityAlert, setIdentityAlert] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<DecryptedMessageItem | null>(null);
  const [localSearch, setLocalSearch] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showIcebreakers, setShowIcebreakers] = useState(false);
  const [iceCat, setIceCat] = useState<(typeof ICEBREAKER_CATEGORIES)[number]>('Thoughtful');
  const [icebreakers, setIcebreakers] = useState<string[]>([]);
  const [loadingIce, setLoadingIce] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceRecorder, setVoiceRecorder] = useState<MediaRecorder | null>(null);
  const [disappearingSec, setDisappearingSec] = useState(0);
  const [reportMsg, setReportMsg] = useState<DecryptedMessageItem | null>(null);
  const [reportConsent, setReportConsent] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const [error, setError] = useState('');

  const typingTimeoutRef = useRef<number | null>(null);
  const activeMatch = useMemo(
    () => matches.find((m) => m.matchId === activeMatchId) || null,
    [matches, activeMatchId]
  );

  useEffect(() => {
    apiFetch('/api/discovery/matches')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.matches || []) as MatchSummary[];
        setMatches(list);
        if (!activeMatchId && list.length > 0) {
          setActiveMatchId(initialMatchId || list[0].matchId);
        }
      });
  }, [apiFetch, initialMatchId, activeMatchId]);

  const loadConversation = useCallback(async () => {
    if (!activeMatch || !user || !e2eeDeviceId) return;
    setLoadingMsgs(true);
    setError('');
    try {
      const [bundleRes, msgRes] = await Promise.all([
        apiFetch(`/api/e2ee/bundles/${activeMatch.partnerId}`),
        apiFetch(`/api/e2ee/conversations/${activeMatch.matchId}/messages?deviceId=${e2eeDeviceId}`),
      ]);

      if (bundleRes.ok) {
        const bData = await bundleRes.json();
        setPartnerBundles(bData.bundles || []);
        setPartnerOnline(Boolean(bData.online));
        if (bData.bundles?.[0]) {
          const sn = await computeSafetyNumber(
            user.id,
            activeMatch.partnerId,
            bData.bundles[0].identityKeyB64
          );
          setSafetyNumber(sn);
        } else {
          setSafetyNumber(null);
        }
      }

      if (msgRes.ok) {
        const mData = await msgRes.json();
        setDisappearingSec(mData.disappearingSeconds || 0);
        const rawList = (mData.messages || []) as Array<{
          id: string;
          clientMsgId: string;
          senderId: string;
          senderDeviceId: number;
          signalType: number;
          ciphertextB64: string;
          replyToId: string;
          createdAt: number;
          readAt: number;
          expiresAt: number;
        }>;

        const decrypted: DecryptedMessageItem[] = [];
        const unreadIds: string[] = [];
        for (const row of rawList) {
          const dec = await decryptEnvelope({
            myUserId: user.id,
            matchId: activeMatch.matchId,
            clientMsgId: row.clientMsgId,
            senderId: row.senderId,
            senderDeviceId: row.senderDeviceId,
            signalType: row.signalType,
            ciphertextB64: row.ciphertextB64,
          });
          if (dec.identityChanged) setIdentityAlert(true);
          let attachmentObjectUrl: string | undefined;
          if (dec.payload?.attachment) {
            try {
              const attRes = await apiFetch(dec.payload.attachment.url);
              if (attRes.ok) {
                const buf = await attRes.arrayBuffer();
                attachmentObjectUrl = await decryptAttachmentOnDevice(
                  buf,
                  dec.payload.attachment.keyB64,
                  dec.payload.attachment.ivB64,
                  dec.payload.attachment.mimeType
                );
              }
            } catch {
              // ignore missing attachment
            }
          }
          decrypted.push({
            id: row.id,
            clientMsgId: row.clientMsgId,
            senderId: row.senderId,
            replyToId: row.replyToId,
            payload: dec.payload,
            identityChanged: dec.identityChanged,
            createdAt: row.createdAt,
            readAt: row.readAt,
            expiresAt: row.expiresAt,
            attachmentObjectUrl,
          });
          if (row.senderId !== user.id && row.readAt === 0) {
            unreadIds.push(row.clientMsgId);
          }
        }
        setMessages(decrypted);

        if (unreadIds.length > 0 && socket && consent?.readReceipts) {
          socket.emit('message:read', { matchId: activeMatch.matchId, messageIds: unreadIds });
        }
      }
    } finally {
      setLoadingMsgs(false);
    }
  }, [activeMatch, apiFetch, consent?.readReceipts, e2eeDeviceId, socket, user]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  // Real-time Socket.IO events
  useEffect(() => {
    if (!socket || !activeMatch || !user || !e2eeDeviceId) return;
    socket.emit('match:join', activeMatch.matchId);

    const onMessage = async (incoming: {
      id: string;
      matchId: string;
      senderId: string;
      senderDeviceId: number;
      recipientDeviceId: number;
      signalType: number;
      ciphertextB64: string;
      clientMsgId: string;
      replyToId: string;
      expiresAt: number;
      createdAt: number;
    }) => {
      if (incoming.matchId !== activeMatch.matchId) return;
      if (incoming.recipientDeviceId !== e2eeDeviceId && incoming.senderId !== user.id) return;

      const dec = await decryptEnvelope({
        myUserId: user.id,
        matchId: activeMatch.matchId,
        clientMsgId: incoming.clientMsgId,
        senderId: incoming.senderId,
        senderDeviceId: incoming.senderDeviceId,
        signalType: incoming.signalType,
        ciphertextB64: incoming.ciphertextB64,
      });
      if (dec.identityChanged) setIdentityAlert(true);

      let attachmentObjectUrl: string | undefined;
      if (dec.payload?.attachment) {
        const attRes = await apiFetch(dec.payload.attachment.url);
        if (attRes.ok) {
          attachmentObjectUrl = await decryptAttachmentOnDevice(
            await attRes.arrayBuffer(),
            dec.payload.attachment.keyB64,
            dec.payload.attachment.ivB64,
            dec.payload.attachment.mimeType
          );
        }
      }

      setMessages((prev) => {
        if (prev.some((m) => m.clientMsgId === incoming.clientMsgId)) return prev;
        return [
          ...prev,
          {
            id: incoming.id,
            clientMsgId: incoming.clientMsgId,
            senderId: incoming.senderId,
            replyToId: incoming.replyToId,
            payload: dec.payload,
            identityChanged: dec.identityChanged,
            createdAt: incoming.createdAt,
            readAt: 0,
            expiresAt: incoming.expiresAt,
            attachmentObjectUrl,
          },
        ];
      });
    };

    const onTyping = (ev: { matchId: string; userId: string; typing: boolean }) => {
      if (ev.matchId === activeMatch.matchId && ev.userId === activeMatch.partnerId) {
        setPartnerTyping(ev.typing);
      }
    };

    const onPresence = (ev: { userId: string; online: boolean }) => {
      if (ev.userId === activeMatch.partnerId) setPartnerOnline(ev.online);
    };

    const onKeyChange = (ev: { userId: string }) => {
      if (ev.userId === activeMatch.partnerId) {
        setIdentityAlert(true);
        loadConversation();
      }
    };

    const onReadReceipt = (ev: { matchId: string; messageIds: string[]; readAt: number }) => {
      if (ev.matchId !== activeMatch.matchId) return;
      setMessages((prev) =>
        prev.map((m) => (ev.messageIds.includes(m.clientMsgId) ? { ...m, readAt: ev.readAt } : m))
      );
    };

    socket.on('e2ee:message', onMessage);
    socket.on('typing:update', onTyping);
    socket.on('presence:update', onPresence);
    socket.on('e2ee:identity-changed', onKeyChange);
    socket.on('message:read-receipt', onReadReceipt);

    return () => {
      socket.off('e2ee:message', onMessage);
      socket.off('typing:update', onTyping);
      socket.off('presence:update', onPresence);
      socket.off('e2ee:identity-changed', onKeyChange);
      socket.off('message:read-receipt', onReadReceipt);
    };
  }, [activeMatch, apiFetch, e2eeDeviceId, loadConversation, socket, user]);

  const sendEncryptedPayload = async (payload: DecryptedPayload) => {
    if (!activeMatch || !user || !e2eeDeviceId) return;
    if (partnerBundles.length === 0) {
      setError('Cannot send: recipient has not registered a Signal Protocol device key yet.');
      return;
    }

    const clientMsgId = crypto.randomUUID();
    const envelopes = await encryptPayloadForDevices({
      senderId: user.id,
      matchId: activeMatch.matchId,
      clientMsgId,
      payload,
      targetBundles: partnerBundles,
    });

    // Also store a Signal-encrypted copy addressed to this sender device for reload persistence
    const ownBundleRes = await apiFetch(`/api/e2ee/bundles/${user.id}`);
    let allEnvelopes = [...envelopes];
    if (ownBundleRes.ok) {
      const ownData = await ownBundleRes.json();
      const ownBundles = (ownData.bundles || []) as RemoteDeviceBundle[];
      if (ownBundles.length > 0) {
        const ownEnvs = await encryptPayloadForDevices({
          senderId: user.id,
          matchId: activeMatch.matchId,
          clientMsgId,
          payload,
          targetBundles: ownBundles,
        });
        allEnvelopes = [...allEnvelopes, ...ownEnvs];
      }
    }

    const res = await apiFetch(`/api/e2ee/conversations/${activeMatch.matchId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientMsgId,
        senderDeviceId: e2eeDeviceId,
        replyToId: replyTo?.clientMsgId || '',
        envelopes: allEnvelopes,
      }),
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Failed to deliver encrypted message');
      return;
    }

    const stored = await res.json();
    let attachmentObjectUrl: string | undefined;
    if (payload.attachment) {
      const attRes = await apiFetch(payload.attachment.url);
      if (attRes.ok) {
        attachmentObjectUrl = await decryptAttachmentOnDevice(
          await attRes.arrayBuffer(),
          payload.attachment.keyB64,
          payload.attachment.ivB64,
          payload.attachment.mimeType
        );
      }
    }

    setMessages((prev) => [
      ...prev,
      {
        id: clientMsgId,
        clientMsgId,
        senderId: user.id,
        replyToId: replyTo?.clientMsgId || '',
        payload,
        identityChanged: false,
        createdAt: stored.createdAt || Date.now(),
        readAt: 0,
        expiresAt: stored.expiresAt || 0,
        attachmentObjectUrl,
      },
    ]);
    setReplyTo(null);
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    if (socket && activeMatch) socket.emit('typing:stop', { matchId: activeMatch.matchId });
    await sendEncryptedPayload({ text, kind: 'text', sentAt: Date.now() });
  };

  const handleAttachmentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeMatch) return;
    const bytes = await file.arrayBuffer();
    const { ciphertextBlob, keyB64, ivB64 } = await encryptAttachmentOnDevice(bytes);
    const form = new FormData();
    form.append('ciphertext', ciphertextBlob, 'encrypted.bin');

    const res = await apiFetch(`/api/e2ee/attachments/${activeMatch.matchId}`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      setError('Failed to upload encrypted attachment');
      return;
    }
    const data = await res.json();
    await sendEncryptedPayload({
      text: file.name,
      kind: file.type.startsWith('audio/') ? 'voice' : 'image',
      attachment: {
        url: data.url,
        keyB64,
        ivB64,
        mimeType: file.type || 'image/jpeg',
        fileName: file.name,
      },
      sentAt: Date.now(),
    });
  };

  const toggleVoiceNote = async () => {
    if (!activeMatch) return;
    if (recordingVoice && voiceRecorder) {
      voiceRecorder.stop();
      setRecordingVoice(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const { ciphertextBlob, keyB64, ivB64 } = await encryptAttachmentOnDevice(
          await blob.arrayBuffer()
        );
        const form = new FormData();
        form.append('ciphertext', ciphertextBlob, 'voice.enc');
        const res = await apiFetch(`/api/e2ee/attachments/${activeMatch.matchId}`, {
          method: 'POST',
          body: form,
        });
        if (res.ok) {
          const data = await res.json();
          await sendEncryptedPayload({
            text: 'Encrypted Voice Message',
            kind: 'voice',
            attachment: {
              url: data.url,
              keyB64,
              ivB64,
              mimeType: blob.type || 'audio/webm',
            },
            sentAt: Date.now(),
          });
        }
      };
      rec.start();
      setVoiceRecorder(rec);
      setRecordingVoice(true);
    } catch {
      setError('Microphone permission is unavailable.');
    }
  };

  const fetchIcebreakers = async () => {
    if (!activeMatch) return;
    setLoadingIce(true);
    try {
      const res = await apiFetch('/api/ai/icebreakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: activeMatch.matchId, category: iceCat }),
      });
      if (res.ok) {
        const d = await res.json();
        setIcebreakers(d.starters || []);
      }
    } finally {
      setLoadingIce(false);
    }
  };

  const filteredMessages = useMemo(() => {
    if (!localSearch.trim()) return messages;
    const q = localSearch.toLowerCase();
    return messages.filter((m) => m.payload?.text.toLowerCase().includes(q));
  }, [localSearch, messages]);

  const canSendE2ee = Boolean(activeMatch && partnerBundles.length > 0 && e2eeDeviceId);

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-140px)] min-h-[540px]">
      {/* Match Thread List */}
      <aside className="lg:col-span-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] p-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display text-lg font-semibold">Encrypted Chats</h1>
          <span className="text-[11px] font-mono text-slate-500">Signal E2EE</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {matches.length === 0 ? (
            <p className="text-xs text-slate-500 p-3">
              No mutual matches yet. Like profiles in Discover to unlock encrypted chat.
            </p>
          ) : (
            matches.map((m) => (
              <button
                key={m.matchId}
                type="button"
                onClick={() => setActiveMatchId(m.matchId)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-colors ${
                  m.matchId === activeMatchId
                    ? 'bg-[#7C5CFC]/12 text-slate-900 dark:text-white'
                    : 'hover:bg-slate-50 dark:hover:bg-[#1E192C]'
                }`}
              >
                {m.photosHidden || !m.photos[0] ? (
                  <div className="w-11 h-11 rounded-xl bg-[#F1EBFE] dark:bg-[#231B38] flex items-center justify-center shrink-0">
                    <EyeOff className="w-4 h-4 text-[#7C5CFC]" />
                  </div>
                ) : (
                  <img
                    src={m.photos[0].url}
                    alt={m.displayName}
                    className="w-11 h-11 rounded-xl object-cover shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{m.displayName}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {m.isBlindMatch && !m.photosRevealed ? 'Blind Connect · ' : ''}
                    {m.compatibilityScore}% alignment
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Active Conversation */}
      <section className="lg:col-span-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] flex flex-col overflow-hidden">
        {!activeMatch ? (
          <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-500">
            Select a mutual match to start an end-to-end encrypted conversation.
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/profile/${activeMatch.partnerId}`)}
                    className="font-display text-lg font-semibold hover:text-[#7C5CFC]"
                  >
                    {activeMatch.displayName}
                  </button>
                  {partnerOnline && (
                    <span className="text-[11px] font-medium text-emerald-600">· Online</span>
                  )}
                  {partnerTyping && (
                    <span className="text-[11px] text-[#7C5CFC]">· typing...</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-emerald-600" />
                  {canSendE2ee
                    ? 'Signal Protocol (X3DH + Double Ratchet) active · Server stores ciphertext only'
                    : 'Waiting for recipient device Signal key bundle'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    placeholder="Search locally..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs w-36"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowSafetyModal(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#7C5CFC]" />
                  Safety Number
                </button>

                <select
                  aria-label="Disappearing message timer"
                  value={disappearingSec}
                  onChange={async (e) => {
                    const seconds = Number(e.target.value);
                    setDisappearingSec(seconds);
                    await apiFetch(`/api/e2ee/conversations/${activeMatch.matchId}/disappearing`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ seconds }),
                    });
                  }}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E192C] px-2.5 py-1.5 text-xs"
                >
                  <option value={0}>Timer: Off</option>
                  <option value={3600}>Disappear: 1h</option>
                  <option value={86400}>Disappear: 24h</option>
                  <option value={604800}>Disappear: 7d</option>
                </select>

                <button
                  type="button"
                  aria-label="Clear conversation"
                  onClick={async () => {
                    await apiFetch(`/api/e2ee/conversations/${activeMatch.matchId}`, {
                      method: 'DELETE',
                    });
                    setMessages([]);
                  }}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {identityAlert && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Recipient&apos;s Signal identity key changed (new browser or device). Verify your Safety Number.
                </span>
                <button
                  type="button"
                  onClick={() => setShowSafetyModal(true)}
                  className="font-semibold underline"
                >
                  Verify
                </button>
              </div>
            )}

            {disappearingSec > 0 && (
              <div className="bg-slate-50 dark:bg-[#1D1829] px-4 py-1.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Disappearing timer active ({Math.round(disappearingSec / 3600)}h). Note: recipients can still screenshot or save copies before expiration.
                </span>
              </div>
            )}

            {!canSendE2ee && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200">
                Real-user E2EE requires both accounts to have an active Signal Protocol device key bundle. Have your match sign in once to register their device keys, or test two-account chat by signing into two accounts in separate browser profiles.
              </div>
            )}

            {/* Message Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <p className="text-xs text-slate-400">Decrypting conversation locally...</p>
              ) : filteredMessages.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <p className="text-sm text-slate-500">
                    No decrypted messages yet. Use an AI Icebreaker below or write your own greeting.
                  </p>
                </div>
              ) : (
                filteredMessages.map((msg) => {
                  const mine = msg.senderId === user?.id;
                  return (
                    <div key={msg.clientMsgId} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      {msg.replyToId && (
                        <span className="text-[10px] text-slate-400 mb-0.5">Replying to message</span>
                      )}
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                          mine
                            ? 'bg-[#7C5CFC] text-white'
                            : 'bg-slate-100 dark:bg-[#221C32] text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {msg.payload ? (
                          <>
                            {msg.payload.kind === 'image' && msg.attachmentObjectUrl && (
                              <img
                                src={msg.attachmentObjectUrl}
                                alt="Decrypted attachment"
                                className="max-h-64 rounded-xl mb-2 object-cover"
                              />
                            )}
                            {msg.payload.kind === 'voice' && msg.attachmentObjectUrl && (
                              <audio controls src={msg.attachmentObjectUrl} className="mb-1.5 max-w-full" />
                            )}
                            <p className="whitespace-pre-wrap break-words">{msg.payload.text}</p>
                          </>
                        ) : (
                          <p className="italic text-xs opacity-75">
                            Encrypted on another device or session key unavailable.
                          </p>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {mine && msg.readAt > 0 && <span>· Read</span>}
                        <button
                          type="button"
                          onClick={() => setReplyTo(msg)}
                          className="hover:text-[#7C5CFC]"
                          aria-label="Reply"
                        >
                          <Reply className="w-3 h-3" />
                        </button>
                        {!mine && msg.payload && (
                          <button
                            type="button"
                            onClick={() => setReportMsg(msg)}
                            className="hover:text-rose-600"
                            aria-label="Report message"
                          >
                            <Flag className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* AI Icebreaker Drawer */}
            {showIcebreakers && (
              <div className="border-t border-slate-200 dark:border-slate-800 bg-[#FAF8FC] dark:bg-[#1B1628] p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {ICEBREAKER_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setIceCat(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                          iceCat === cat
                            ? 'bg-[#7C5CFC] text-white'
                            : 'bg-white dark:bg-[#262038] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={loadingIce}
                    onClick={fetchIcebreakers}
                    className="px-3 py-1 rounded-lg bg-[#E85D93] text-white text-[11px] font-semibold"
                  >
                    {loadingIce ? 'Generating...' : 'Generate Starters'}
                  </button>
                </div>
                {icebreakers.length > 0 && (
                  <div className="space-y-1.5">
                    {icebreakers.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setDraft(s);
                          setShowIcebreakers(false);
                        }}
                        className="w-full text-left p-2 rounded-xl bg-white dark:bg-[#161220] border border-slate-200 dark:border-slate-700 text-xs hover:border-[#7C5CFC]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <p className="px-4 py-1.5 text-xs text-rose-600">{error}</p>}

            {/* Composer */}
            <form onSubmit={handleSendText} className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              {replyTo && (
                <div className="flex items-center justify-between text-xs bg-slate-100 dark:bg-[#1E192C] px-3 py-1.5 rounded-xl">
                  <span className="truncate">Replying to: {replyTo.payload?.text}</span>
                  <button type="button" onClick={() => setReplyTo(null)} className="text-slate-500">
                    Cancel
                  </button>
                </div>
              )}

              {showEmojis && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {EMOJI_PALETTE.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setDraft((d) => d + em)}
                      className="px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-base"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowIcebreakers((s) => !s)}
                  title="AI Icebreakers"
                  className="min-w-[40px] min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[#7C5CFC]"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmojis((s) => !s)}
                  title="Emoji"
                  className="min-w-[40px] min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                >
                  <Smile className="w-4 h-4" />
                </button>
                <label
                  title="Send encrypted image"
                  className="min-w-[40px] min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={!canSendE2ee}
                    onChange={handleAttachmentFile}
                  />
                </label>
                <button
                  type="button"
                  onClick={toggleVoiceNote}
                  disabled={!canSendE2ee}
                  title="Send encrypted voice note"
                  className={`min-w-[40px] min-h-[40px] rounded-xl border flex items-center justify-center ${
                    recordingVoice
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {recordingVoice ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <input
                  value={draft}
                  disabled={!canSendE2ee}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (socket && activeMatch) {
                      socket.emit('typing:start', { matchId: activeMatch.matchId });
                      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
                      typingTimeoutRef.current = window.setTimeout(() => {
                        socket.emit('typing:stop', { matchId: activeMatch.matchId });
                      }, 1500);
                    }
                  }}
                  placeholder={
                    canSendE2ee
                      ? 'Write an end-to-end encrypted message...'
                      : 'Messaging disabled until recipient registers Signal keys'
                  }
                  className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3.5 py-2.5 text-sm"
                />

                <button
                  type="submit"
                  disabled={!canSendE2ee || !draft.trim()}
                  className="min-w-[44px] min-h-[44px] px-4 rounded-xl bg-[#7C5CFC] disabled:opacity-40 text-white flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      {/* Safety Number Verification Modal */}
      {showSafetyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-3xl bg-white dark:bg-[#161220] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="font-display text-xl font-semibold">Signal Safety Number</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Compare these 60 digits with {activeMatch?.displayName} out-of-band (in person or on a call) to verify nobody has intercepted your identity keys.
            </p>
            <div className="rounded-2xl bg-slate-100 dark:bg-[#1F1A2E] p-4 font-mono text-sm tracking-wider leading-relaxed text-center select-all">
              {safetyNumber || 'Partner device keys not available yet.'}
            </div>
            <p className="text-[11px] text-slate-500">
              Recovery note: Private keys never leave your browser IndexedDB. Clearing site data permanently makes historical ciphertext unreadable.
            </p>
            <button
              type="button"
              onClick={() => {
                setIdentityAlert(false);
                setShowSafetyModal(false);
              }}
              className="w-full py-2.5 rounded-xl bg-[#7C5CFC] text-white text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Voluntary Message Report Modal */}
      {reportMsg && activeMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/safety/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reportedUserId: activeMatch.partnerId,
                  category: 'Harassment',
                  description: reportNote || 'Reported encrypted conversation message',
                  disclosedExcerpt: reportConsent ? reportMsg.payload?.text || '' : '',
                  consentToShareExcerpt: reportConsent,
                }),
              });
              setReportMsg(null);
              setReportConsent(false);
              setReportNote('');
            }}
            className="max-w-md w-full rounded-3xl bg-white dark:bg-[#161220] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold">Report Message to Safety Team</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Moderators cannot read encrypted chats. Only if you check the box below will this specific decrypted message be disclosed to safety reviewers.
            </p>
            <div className="rounded-xl bg-slate-100 dark:bg-[#1F1A2E] p-3 text-xs italic">
              &ldquo;{reportMsg.payload?.text}&rdquo;
            </div>
            <label className="flex items-start gap-2.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={reportConsent}
                onChange={(e) => setReportConsent(e.target.checked)}
                className="mt-0.5 accent-[#7C5CFC]"
              />
              <span>I explicitly consent to disclose this selected message excerpt to human moderators.</span>
            </label>
            <textarea
              required
              minLength={10}
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              placeholder="Explain what happened..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportMsg(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold">
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

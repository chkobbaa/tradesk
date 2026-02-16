'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './ChatWidget.module.css';

const DEVICE_STORAGE_KEY = 'tradesk-chat-device-id';
const COOKIE_CONSENT_KEY = 'tradesk-cookie-consent';
const THREAD_CACHE_STORAGE_PREFIX = 'tradesk-chat-thread-cache-v1';
const LAST_CHAT_CONTACT_PREFIX = 'tradesk-chat-last-contact-v1';
const LAST_INCOMING_STORAGE_PREFIX = 'tradesk-chat-last-incoming-v1';
const DEVICE_ID_PATTERN = /^[a-f0-9]{32}$/;
const CHAT_ID_PATTERN = /^[a-z0-9]{6}$/;
const MAX_CACHED_MESSAGES = 80;
const MAX_VOICE_RECORDING_MS = 2 * 60 * 1000;
const VOICE_WAVE_BARS = [10, 16, 22, 14, 26, 18, 12, 24, 20, 14, 26, 18, 12, 24, 20, 14, 26, 18, 12, 22];

function createDeviceId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function getOrCreateDeviceId(): string {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY)?.trim().toLowerCase();
    if (existing && DEVICE_ID_PATTERN.test(existing)) {
        return existing;
    }

    const generated = createDeviceId();
    localStorage.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
}

interface ChatMessage {
    id: number;
    fromId: string;
    toId: string;
    message: string;
    timestamp: number;
    optimistic?: boolean;
    failed?: boolean;
    attachment?: {
        messageId: number;
        fileName: string;
        fileUrl: string;
        mimeType: string;
        fileSize: number;
    };
}

interface ChatContact {
    id: number;
    ownerId: string;
    contactId: string;
    displayName: string;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function formatAudioSeconds(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const rounded = Math.floor(seconds);
    const minutes = Math.floor(rounded / 60);
    const secs = (rounded % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
        output[i] = rawData.charCodeAt(i);
    }
    return output;
}

export default function ChatWidget() {
    const [open, setOpen] = useState(false);
    const [myId, setMyId] = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [toId, setToId] = useState('');
    const [contacts, setContacts] = useState<ChatContact[]>([]);
    const [showNewContact, setShowNewContact] = useState(false);
    const [newContactName, setNewContactName] = useState('');
    const [newContactId, setNewContactId] = useState('');
    const [text, setText] = useState('');
    const [uploading, setUploading] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [previewAttachment, setPreviewAttachment] = useState<ChatMessage['attachment'] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cookiesAccepted, setCookiesAccepted] = useState(true);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);
    const [recordingVoice, setRecordingVoice] = useState(false);
    const [recordingMs, setRecordingMs] = useState(0);
    const [audioDurations, setAudioDurations] = useState<Record<number, number>>({});
    const [audioProgress, setAudioProgress] = useState<Record<number, number>>({});
    const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLElement>(null);
    const fabRef = useRef<HTMLButtonElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const voiceChunksRef = useRef<Blob[]>([]);
    const voiceRecordingStartedAtRef = useRef(0);
    const loadInFlightRef = useRef<Map<string, boolean>>(new Map());
    const audioElementsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
    const messageCacheRef = useRef<Map<string, ChatMessage[]>>(new Map());
    const prefetchedContactsRef = useRef<Set<string>>(new Set());
    const cacheHydratedRef = useRef(false);
    const activeContactRef = useRef('');
    const stickToBottomRef = useRef(true);
    const lastIncomingIdRef = useRef(0);
    const incomingPollInitializedRef = useRef(false);

    const updateThreadCache = useCallback((contactId: string, threadMessages: ChatMessage[]) => {
        const normalizedContactId = contactId.trim().toLowerCase();
        if (!CHAT_ID_PATTERN.test(normalizedContactId)) {
            return;
        }

        const persistedMessages = threadMessages
            .filter(message => !message.optimistic && !message.failed)
            .slice(-MAX_CACHED_MESSAGES)
            .map(message => ({
                id: message.id,
                fromId: message.fromId,
                toId: message.toId,
                message: message.message,
                timestamp: message.timestamp,
            }));

        messageCacheRef.current.set(normalizedContactId, persistedMessages);

        if (typeof window === 'undefined' || !myId) {
            return;
        }

        const payload: Record<string, ChatMessage[]> = {};
        for (const [id, messagesForThread] of messageCacheRef.current.entries()) {
            payload[id] = messagesForThread.slice(-MAX_CACHED_MESSAGES);
        }

        localStorage.setItem(`${THREAD_CACHE_STORAGE_PREFIX}:${myId}`, JSON.stringify(payload));
    }, [myId]);

    const fetchWithIdentity = useCallback((url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (deviceId) {
            headers.set('x-chat-device-id', deviceId);
        }
        return fetch(url, { ...init, headers });
    }, [deviceId]);

    const loadIdentity = useCallback(async () => {
        try {
            const res = await fetchWithIdentity('/api/chat/id');
            const data = await res.json();
            if (res.ok && typeof data?.id === 'string') {
                setMyId(data.id);
                setError(null);
                return;
            }
            throw new Error(data?.error || 'Failed to load your chat ID');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load your chat ID');
        }
    }, [fetchWithIdentity]);

    const loadContacts = useCallback(async () => {
        try {
            const res = await fetchWithIdentity('/api/chat/contacts');
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to load contacts');
            }
            if (Array.isArray(data.contacts)) {
                setContacts(data.contacts);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load contacts');
        }
    }, [fetchWithIdentity]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const consent = localStorage.getItem(COOKIE_CONSENT_KEY) === 'accepted';
        setCookiesAccepted(consent);

        try {
            const localDeviceId = getOrCreateDeviceId();
            setDeviceId(localDeviceId);

            const lastContact = localStorage.getItem(`${LAST_CHAT_CONTACT_PREFIX}:${localDeviceId}`)?.trim().toLowerCase();
            if (lastContact && CHAT_ID_PATTERN.test(lastContact)) {
                setToId(lastContact);
            }
        } catch {
            setError('Local storage is unavailable; chat ID may not persist');
        }
    }, []);

    useEffect(() => {
        if (!deviceId || typeof window === 'undefined') return;
        const contactId = toId.trim().toLowerCase();
        if (!CHAT_ID_PATTERN.test(contactId)) return;
        localStorage.setItem(`${LAST_CHAT_CONTACT_PREFIX}:${deviceId}`, contactId);
    }, [deviceId, toId]);

    useEffect(() => {
        if (!deviceId) return;
        loadIdentity();
        loadContacts();
    }, [deviceId, loadContacts, loadIdentity]);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: PointerEvent) => {
            if (previewAttachment) return;
            const target = event.target as Node;
            if (panelRef.current?.contains(target)) return;
            if (fabRef.current?.contains(target)) return;
            setOpen(false);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, previewAttachment]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
        setPushSupported(supported);
        if (!supported) return;

        const hydratePushState = async () => {
            if (Notification.permission !== 'granted') {
                setPushEnabled(false);
                return;
            }

            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                const subscription = await registration.pushManager.getSubscription();
                setPushEnabled(!!subscription);
            } catch {
                setPushEnabled(false);
            }
        };

        void hydratePushState();
    }, []);

    const normalizedToId = useMemo(() => toId.trim().toLowerCase(), [toId]);
    const activeContactName = useMemo(() => {
        const found = contacts.find(contact => contact.contactId === normalizedToId);
        return found?.displayName;
    }, [contacts, normalizedToId]);

    useEffect(() => {
        activeContactRef.current = normalizedToId;
    }, [normalizedToId]);

    useEffect(() => {
        if (!myId || cacheHydratedRef.current || typeof window === 'undefined') return;

        cacheHydratedRef.current = true;

        try {
            const raw = localStorage.getItem(`${THREAD_CACHE_STORAGE_PREFIX}:${myId}`);
            if (!raw) return;

            const parsed = JSON.parse(raw) as Record<string, ChatMessage[] | undefined>;
            for (const [contactId, threadMessages] of Object.entries(parsed)) {
                if (!CHAT_ID_PATTERN.test(contactId) || !Array.isArray(threadMessages)) {
                    continue;
                }

                const safeMessages = threadMessages
                    .filter(message =>
                        typeof message?.id === 'number' &&
                        typeof message?.fromId === 'string' &&
                        typeof message?.toId === 'string' &&
                        typeof message?.message === 'string' &&
                        typeof message?.timestamp === 'number'
                    )
                    .slice(-MAX_CACHED_MESSAGES)
                    .map(message => ({
                        id: message.id,
                        fromId: message.fromId,
                        toId: message.toId,
                        message: message.message,
                        timestamp: message.timestamp,
                    }));

                messageCacheRef.current.set(contactId, safeMessages);
            }

            if (normalizedToId.length === 6) {
                const hydrated = messageCacheRef.current.get(normalizedToId);
                if (hydrated) {
                    setMessages(hydrated);
                }
            }
        } catch {
            // Ignore corrupted cache payloads.
        }
    }, [myId, normalizedToId]);

    const loadMessages = useCallback(async (
        contactIdOverride?: string,
        options?: { silent?: boolean; force?: boolean; skipRetry?: boolean }
    ) => {
        const targetId = (contactIdOverride ?? normalizedToId).trim().toLowerCase();
        if (targetId.length !== 6) return;

        if (loadInFlightRef.current.get(targetId) && !options?.force) {
            return;
        }

        loadInFlightRef.current.set(targetId, true);

        try {
            const res = await fetchWithIdentity(`/api/chat/messages?with=${targetId}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to load messages');
            }

            if (!Array.isArray(data.messages)) return;

            const nextMessages = data.messages as ChatMessage[];
            updateThreadCache(targetId, nextMessages);

            if (targetId === activeContactRef.current) {
                setMessages(prev => {
                    const localPending = prev.filter(m =>
                        (m.optimistic || m.failed) &&
                        m.fromId === myId &&
                        m.toId === targetId
                    );

                    const merged = [...nextMessages];
                    for (const pending of localPending) {
                        if (!merged.some(serverMessage => serverMessage.id === pending.id)) {
                            merged.push(pending);
                        }
                    }

                    merged.sort((a, b) => a.timestamp - b.timestamp);
                    return merged;
                });
            }

            setError(null);
        } catch (err) {
            if (!options?.skipRetry) {
                await loadMessages(targetId, { ...options, skipRetry: true, force: true });
                return;
            }

            if (!options?.silent) {
                setError(err instanceof Error ? err.message : 'Failed to load messages');
            }
        } finally {
            loadInFlightRef.current.delete(targetId);
        }
    }, [fetchWithIdentity, myId, normalizedToId, updateThreadCache]);

    useEffect(() => {
        if (contacts.length === 0) return;

        const topContacts = contacts.slice(0, 5);
        for (const contact of topContacts) {
            if (prefetchedContactsRef.current.has(contact.contactId)) {
                continue;
            }

            prefetchedContactsRef.current.add(contact.contactId);
            void loadMessages(contact.contactId, { silent: true });
        }
    }, [contacts, loadMessages]);

    useEffect(() => {
        if (!myId || typeof window === 'undefined') return;

        const savedLastIncoming = Number(localStorage.getItem(`${LAST_INCOMING_STORAGE_PREFIX}:${myId}`) || '0');
        if (Number.isFinite(savedLastIncoming) && savedLastIncoming > 0) {
            lastIncomingIdRef.current = savedLastIncoming;
            incomingPollInitializedRef.current = true;
        }
    }, [myId]);

    useEffect(() => {
        if (normalizedToId.length !== 6) {
            setMessages([]);
            return;
        }

        stickToBottomRef.current = true;

        const cached = messageCacheRef.current.get(normalizedToId);
        if (cached) {
            setMessages(cached);
        }

        void loadMessages(normalizedToId, { silent: true });
    }, [loadMessages, normalizedToId]);

    useEffect(() => {
        if (normalizedToId.length !== 6) return;

        let isActive = true;

        const safeLoad = async () => {
            if (!isActive) return;
            await loadMessages(undefined, { silent: true });
        };

        const timer = setInterval(safeLoad, open ? 10000 : 20000);

        return () => {
            isActive = false;
            clearInterval(timer);
        };
    }, [loadMessages, open, normalizedToId]);

    useEffect(() => {
        if (!myId) return;

        let isActive = true;

        const pollIncoming = async () => {
            if (!isActive) return;

            try {
                const res = await fetchWithIdentity(`/api/chat/messages?incomingSinceId=${lastIncomingIdRef.current}`);
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data?.error || 'Failed to poll incoming messages');
                }

                const incoming = Array.isArray(data?.incoming) ? (data.incoming as ChatMessage[]) : [];

                if (incoming.length === 0) {
                    incomingPollInitializedRef.current = true;
                    return;
                }

                const maxSeenId = incoming.reduce((max, message) => Math.max(max, message.id), lastIncomingIdRef.current);

                if (!incomingPollInitializedRef.current) {
                    lastIncomingIdRef.current = maxSeenId;
                    incomingPollInitializedRef.current = true;

                    if (typeof window !== 'undefined' && myId) {
                        localStorage.setItem(`${LAST_INCOMING_STORAGE_PREFIX}:${myId}`, String(lastIncomingIdRef.current));
                    }

                    if (normalizedToId.length === 6 && incoming.some(message => message.fromId === normalizedToId)) {
                        void loadMessages(normalizedToId, { silent: true });
                    }
                    return;
                }

                lastIncomingIdRef.current = maxSeenId;

                if (typeof window !== 'undefined' && myId) {
                    localStorage.setItem(`${LAST_INCOMING_STORAGE_PREFIX}:${myId}`, String(lastIncomingIdRef.current));
                }

                let unreadDelta = 0;
                let shouldRefreshActiveConversation = false;

                for (const message of incoming) {
                    const isFromActiveContact = message.fromId === normalizedToId;
                    if (isFromActiveContact) {
                        shouldRefreshActiveConversation = true;
                    }

                    const shouldNotifyNow = !open || document.visibilityState !== 'visible' || !isFromActiveContact;
                    if (!shouldNotifyNow) {
                        continue;
                    }

                    unreadDelta += 1;

                    if (
                        pushEnabled &&
                        typeof window !== 'undefined' &&
                        'Notification' in window &&
                        Notification.permission === 'granted'
                    ) {
                        const senderContact = contacts.find(contact => contact.contactId === message.fromId)?.displayName;
                        const senderLabel = senderContact || message.fromId;
                        new Notification(`Message from ${senderLabel}`, {
                            body: message.message,
                            tag: `chat-${message.id}`,
                        });
                    }
                }

                if (unreadDelta > 0) {
                    setUnreadCount(count => count + unreadDelta);
                }

                if (shouldRefreshActiveConversation && normalizedToId.length === 6) {
                    void loadMessages(normalizedToId, { silent: true });
                }

                setError(null);
            } catch {
                // Avoid surfacing background polling noise in the chat error banner.
            }
        };

        void pollIncoming();
        const timer = setInterval(pollIncoming, open ? 2000 : 5000);

        return () => {
            isActive = false;
            clearInterval(timer);
        };
    }, [contacts, fetchWithIdentity, loadMessages, myId, normalizedToId, open, pushEnabled]);

    useEffect(() => {
        if (open) {
            setUnreadCount(0);
        }
    }, [open]);

    useEffect(() => {
        if (!listRef.current) return;
        if (!stickToBottomRef.current) return;
        listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages, open]);

    const handleMessagesScroll = useCallback(() => {
        const list = listRef.current;
        if (!list) return;

        const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
        stickToBottomRef.current = distanceFromBottom <= 56;
    }, []);

    const sendMessage = async () => {
        const messageText = text.trim();
        if (normalizedToId.length !== 6 || messageText.length === 0) return;

        const optimisticId = -Date.now();
        const optimisticMessage: ChatMessage = {
            id: optimisticId,
            fromId: myId,
            toId: normalizedToId,
            message: messageText,
            timestamp: Date.now(),
            optimistic: true,
        };

        setText('');
        stickToBottomRef.current = true;
        setMessages(prev => {
            const next = [...prev, optimisticMessage];
            updateThreadCache(normalizedToId, next);
            return next;
        });

        try {
            const res = await fetchWithIdentity('/api/chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toId: normalizedToId,
                    message: messageText,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to send message');
            }

            setMessages(prev => prev.filter(message => message.id !== optimisticId));
            await loadMessages();
            setError(null);
        } catch (err) {
            setMessages(prev => prev.map(message => (
                message.id === optimisticId
                    ? { ...message, optimistic: false, failed: true }
                    : message
            )));
            setText(messageText);
            setError(err instanceof Error ? err.message : 'Failed to send message');
        }
    };

    const stopVoiceRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) return;

        if (recorder.state !== 'inactive') {
            recorder.stop();
        }
    }, []);

    useEffect(() => {
        if (!recordingVoice) {
            setRecordingMs(0);
            return;
        }

        const timer = window.setInterval(() => {
            const elapsed = Date.now() - voiceRecordingStartedAtRef.current;
            setRecordingMs(elapsed);

            if (elapsed >= MAX_VOICE_RECORDING_MS) {
                stopVoiceRecording();
            }
        }, 250);

        return () => {
            window.clearInterval(timer);
        };
    }, [recordingVoice, stopVoiceRecording]);

    const startVoiceRecording = useCallback(async () => {
        if (recordingVoice || uploading) return;
        if (normalizedToId.length !== 6) {
            setError('Choose a recipient before recording voice messages');
            return;
        }

        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setError('Voice recording is not supported on this device');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const preferredMimeTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/ogg',
            ];

            const selectedMimeType = preferredMimeTypes.find(type =>
                typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)
            );

            const recorder = selectedMimeType
                ? new MediaRecorder(stream, { mimeType: selectedMimeType })
                : new MediaRecorder(stream);

            mediaRecorderRef.current = recorder;
            voiceChunksRef.current = [];

            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) {
                    voiceChunksRef.current.push(event.data);
                }
            };

            recorder.onerror = () => {
                setRecordingVoice(false);
                setError('Voice recording failed');
            };

            recorder.onstop = async () => {
                const chunks = [...voiceChunksRef.current];
                voiceChunksRef.current = [];

                if (mediaStreamRef.current) {
                    mediaStreamRef.current.getTracks().forEach(track => track.stop());
                    mediaStreamRef.current = null;
                }

                mediaRecorderRef.current = null;
                setRecordingVoice(false);
                setRecordingMs(0);

                if (chunks.length === 0) return;

                const mimeType = recorder.mimeType || 'audio/webm';
                const blob = new Blob(chunks, { type: mimeType });

                const extension = mimeType.includes('mp4')
                    ? '.m4a'
                    : mimeType.includes('mpeg')
                        ? '.mp3'
                        : mimeType.includes('ogg')
                            ? '.ogg'
                            : mimeType.includes('wav')
                                ? '.wav'
                                : '.webm';

                const file = new File([blob], `voice-${Date.now()}${extension}`, { type: mimeType });
                await uploadFile(file);
            };

            recorder.start(300);
            voiceRecordingStartedAtRef.current = Date.now();
            setRecordingVoice(true);
            setRecordingMs(0);
            setError(null);
        } catch {
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
                mediaStreamRef.current = null;
            }
            setRecordingVoice(false);
            setRecordingMs(0);
            setError('Unable to access microphone');
        }
    }, [normalizedToId, recordingVoice, uploading]);

    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
                mediaStreamRef.current = null;
            }
            for (const audioElement of audioElementsRef.current.values()) {
                audioElement.pause();
            }
            audioElementsRef.current.clear();
        };
    }, []);

    const registerAudioElement = useCallback((messageId: number, element: HTMLAudioElement | null) => {
        if (!element) {
            audioElementsRef.current.delete(messageId);
            return;
        }
        audioElementsRef.current.set(messageId, element);
    }, []);

    const toggleAudioPlayback = useCallback(async (messageId: number) => {
        const audioElement = audioElementsRef.current.get(messageId);
        if (!audioElement) return;

        if (playingAudioId !== null && playingAudioId !== messageId) {
            const previous = audioElementsRef.current.get(playingAudioId);
            if (previous) {
                previous.pause();
            }
        }

        if (!audioElement.paused) {
            audioElement.pause();
            setPlayingAudioId(null);
            return;
        }

        try {
            await audioElement.play();
            setPlayingAudioId(messageId);
        } catch {
            setError('Unable to play this voice message');
        }
    }, [playingAudioId]);

    const togglePush = async () => {
        if (!pushSupported || typeof window === 'undefined' || !('Notification' in window)) {
            setError('Push notifications are not supported in this browser');
            return;
        }

        if ('serviceWorker' in navigator && pushEnabled) {
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await subscription.unsubscribe();
                    await fetchWithIdentity('/api/notifications/subscribe', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ endpoint: subscription.endpoint }),
                    });
                }
            } catch {
                // Keep local toggle responsive even if unsubscribe fails.
            }
            setPushEnabled(false);
            return;
        }

        const permission = Notification.permission === 'granted'
            ? 'granted'
            : await Notification.requestPermission();

        if (permission === 'granted') {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

                if (!publicKey) {
                    throw new Error('Missing VAPID public key');
                }

                const keyBytes = urlBase64ToUint8Array(publicKey);
                const applicationServerKey = keyBytes as unknown as BufferSource;

                const existingSubscription = await registration.pushManager.getSubscription();
                const subscription = existingSubscription || await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey,
                });

                await fetchWithIdentity('/api/notifications/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subscription }),
                });

                setPushEnabled(true);
                setError(null);
                return;
            } catch {
                setPushEnabled(false);
                setError('Push subscription setup failed on this device');
                return;
            }
        }

        setPushEnabled(false);
        setError('Push notification permission was denied');
    };

    const acceptCookies = async () => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
        setCookiesAccepted(true);
        await loadIdentity();
    };

    const saveContact = async () => {
        const contactId = newContactId.trim().toLowerCase();
        const displayName = newContactName.trim();

        if (!/^[a-z0-9]{6}$/.test(contactId)) {
            setError('Contact ID must be 6 characters');
            return;
        }

        if (displayName.length < 1) {
            setError('Contact name is required');
            return;
        }

        try {
            const res = await fetchWithIdentity('/api/chat/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactId, displayName }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to save contact');
            }

            if (Array.isArray(data.contacts)) {
                setContacts(data.contacts);
            } else {
                await loadContacts();
            }

            setNewContactId('');
            setNewContactName('');
            setToId(contactId);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save contact');
        }
    };

    const removeContact = async (contactId: string) => {
        try {
            const res = await fetchWithIdentity('/api/chat/contacts', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactId }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to delete contact');
            }

            if (Array.isArray(data.contacts)) {
                setContacts(data.contacts);
            } else {
                await loadContacts();
            }
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete contact');
        }
    };

    const uploadFile = async (file: File) => {
        if (normalizedToId.length !== 6) {
            setError('Choose a recipient before attaching files');
            return;
        }

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('toId', normalizedToId);
            formData.append('file', file);

            const res = await fetchWithIdentity('/api/chat/upload', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to upload file');
            }

            await loadMessages(undefined, { silent: true, force: true });
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload file');
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const panelClassName = `${styles.chatPanel} ${fullscreen ? styles.fullscreen : ''}`;

    return (
        <>
            {open && (
                <section className={panelClassName} aria-label="Chat panel" ref={panelRef}>
                    <div className={styles.header}>
                        <div className={styles.headerInfo}>
                            <div className={styles.title}>Direct Chat</div>
                            <div className={styles.subtitleRow}>
                                <span className={styles.myId}>Your ID: {myId || '...'}</span>
                                <span className={styles.dot}>•</span>
                                <span className={styles.chatWith}>
                                    {normalizedToId.length === 6
                                        ? `Chat with ${activeContactName ? `${activeContactName} (${normalizedToId})` : normalizedToId}`
                                        : 'No recipient selected'}
                                </span>
                            </div>
                        </div>
                        <div className={styles.headerActions}>
                            <button className={styles.headerBtn} onClick={() => setFullscreen(prev => !prev)} aria-label="Toggle fullscreen">
                                {fullscreen ? (
                                    <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                ) : (
                                    <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M21 15v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>
                            <button className={styles.headerBtn} onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
                        </div>
                    </div>

                    <div className={styles.controlsWrap}>
                        <div className={styles.recipientRow}>
                            <select
                                className={styles.input}
                                value={normalizedToId}
                                onChange={(e) => setToId(e.target.value)}
                            >
                                <option value="">Saved contacts</option>
                                {contacts.map(contact => (
                                    <option key={contact.id} value={contact.contactId}>
                                        {contact.displayName} ({contact.contactId})
                                    </option>
                                ))}
                            </select>
                            <input
                                className={styles.input}
                                placeholder="Recipient ID"
                                value={toId}
                                onChange={(e) => setToId(e.target.value)}
                                maxLength={6}
                            />
                        </div>

                        <div className={styles.actionsRow}>
                            <button
                                className={styles.iconBtn}
                                onClick={() => { void loadMessages(undefined, { force: true }); }}
                                disabled={normalizedToId.length !== 6}
                                aria-label="Refresh chat"
                                title="Refresh chat"
                            >
                                <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M20 11a8 8 0 10.93 4M20 4v7h-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <button
                                className={`${styles.iconBtn} ${showNewContact ? styles.iconBtnActive : ''}`}
                                onClick={() => setShowNewContact(prev => !prev)}
                                aria-label={showNewContact ? 'Hide new contact form' : 'Add new contact'}
                                title={showNewContact ? 'Hide new contact form' : 'Add new contact'}
                            >
                                <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <button
                                className={`${styles.iconToggle} ${pushEnabled ? styles.iconOn : styles.iconOff}`}
                                onClick={togglePush}
                                aria-label={pushEnabled ? 'Notifications enabled' : 'Notifications muted'}
                                title={pushEnabled ? 'Notifications enabled' : 'Notifications muted'}
                            >
                                {pushEnabled ? (
                                    <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M15 17H5.5a1.5 1.5 0 01-1.2-2.4l1.2-1.6V10a5.5 5.5 0 0111 0v3l1.2 1.6A1.5 1.5 0 0116.5 17H15z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M10.5 20a2 2 0 004 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                ) : (
                                    <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M15 17H5.5a1.5 1.5 0 01-1.2-2.4l1.2-1.6V10a5.5 5.5 0 018.2-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M18.5 10v3l1.2 1.6A1.5 1.5 0 0119 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                )}
                            </button>
                            <button
                                className={styles.iconBtn}
                                onClick={() => setMessages([])}
                                aria-label="Clear current chat"
                                title="Clear current chat"
                            >
                                <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M20 6L9 17l-5-5 11-11h5v5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M14 8l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {showNewContact && (
                        <div className={styles.newContactRow}>
                            <input
                                className={styles.input}
                                placeholder="Contact name"
                                value={newContactName}
                                onChange={(e) => setNewContactName(e.target.value)}
                                maxLength={40}
                            />
                            <input
                                className={styles.input}
                                placeholder="Friend ID"
                                value={newContactId}
                                onChange={(e) => setNewContactId(e.target.value)}
                                maxLength={6}
                            />
                            <button className={styles.btnPrimary} onClick={saveContact}>Save Contact</button>
                        </div>
                    )}

                    {contacts.length > 0 && (
                        <div className={styles.contactList}>
                            {contacts.map(contact => (
                                <button
                                    key={`${contact.id}-chip`}
                                    className={styles.contactChip}
                                    onClick={() => setToId(contact.contactId)}
                                    title={`${contact.displayName} (${contact.contactId})`}
                                >
                                    <span>{contact.displayName}</span>
                                    <span className={styles.contactMeta}>{contact.contactId}</span>
                                    <span
                                        className={styles.removeContact}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void removeContact(contact.contactId);
                                        }}
                                    >
                                        ✕
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {!cookiesAccepted && (
                        <div className={styles.cookieBanner}>
                            <span>Accept cookies to keep your chat ID stable across refreshes.</span>
                            <button className={styles.btnPrimary} onClick={acceptCookies}>Accept Cookies</button>
                        </div>
                    )}

                    <div className={styles.messages} ref={listRef} onScroll={handleMessagesScroll}>
                        {normalizedToId.length !== 6 ? (
                            <div className={styles.empty}>Choose a contact or enter a 6-character recipient ID to start chatting.</div>
                        ) : messages.length === 0 ? (
                            <div className={styles.empty}>No messages yet. Send a message or share a file to begin.</div>
                        ) : (
                            messages.map((m) => {
                                const mine = m.fromId === myId || (!!m.optimistic && m.toId === normalizedToId);
                                return (
                                    <div
                                        key={m.id}
                                        className={`${styles.bubble} ${mine ? styles.mine : styles.theirs} ${m.optimistic ? styles.sending : ''} ${m.failed ? styles.failed : ''}`}
                                    >
                                        <div>{m.message}</div>
                                        {m.attachment && (
                                            <div className={styles.attachmentWrap}>
                                                {m.attachment.mimeType.startsWith('audio/') ? (
                                                    <div className={styles.voiceCard}>
                                                        <button
                                                            type="button"
                                                            className={styles.voicePlayBtn}
                                                            onClick={() => { void toggleAudioPlayback(m.id); }}
                                                            aria-label={playingAudioId === m.id ? 'Pause voice message' : 'Play voice message'}
                                                        >
                                                            {playingAudioId === m.id ? '❚❚' : '▶'}
                                                        </button>
                                                        <div className={styles.voiceWave}>
                                                            <div
                                                                className={styles.voiceWaveFill}
                                                                style={{ width: `${Math.max(0, Math.min(100, audioProgress[m.id] || 0))}%` }}
                                                            />
                                                            {VOICE_WAVE_BARS.map((height, index) => (
                                                                <span
                                                                    key={`${m.id}-wave-${index}`}
                                                                    className={styles.voiceWaveBar}
                                                                    style={{ height: `${height}px` }}
                                                                />
                                                            ))}
                                                        </div>
                                                        <span className={styles.voiceDuration}>
                                                            {formatAudioSeconds(
                                                                playingAudioId === m.id
                                                                    ? ((audioDurations[m.id] || 0) * ((audioProgress[m.id] || 0) / 100))
                                                                    : (audioDurations[m.id] || 0)
                                                            )}
                                                        </span>
                                                        <audio
                                                            ref={(element) => registerAudioElement(m.id, element)}
                                                            className={styles.voiceNative}
                                                            preload="metadata"
                                                            src={m.attachment.fileUrl}
                                                            onLoadedMetadata={(event) => {
                                                                const duration = event.currentTarget.duration;
                                                                if (Number.isFinite(duration) && duration > 0) {
                                                                    setAudioDurations(prev => ({ ...prev, [m.id]: duration }));
                                                                }
                                                            }}
                                                            onTimeUpdate={(event) => {
                                                                const audioElement = event.currentTarget;
                                                                const duration = audioElement.duration;
                                                                const progress = duration > 0
                                                                    ? (audioElement.currentTime / duration) * 100
                                                                    : 0;
                                                                setAudioProgress(prev => ({ ...prev, [m.id]: progress }));
                                                            }}
                                                            onEnded={() => {
                                                                setPlayingAudioId(prev => (prev === m.id ? null : prev));
                                                                setAudioProgress(prev => ({ ...prev, [m.id]: 0 }));
                                                            }}
                                                            onPause={() => {
                                                                setPlayingAudioId(prev => (prev === m.id ? null : prev));
                                                            }}
                                                        />
                                                    </div>
                                                ) : m.attachment.mimeType.startsWith('image/') ? (
                                                    <button
                                                        className={styles.attachmentPreviewBtn}
                                                        onClick={() => setPreviewAttachment(m.attachment || null)}
                                                        aria-label={`Open attachment ${m.attachment.fileName}`}
                                                    >
                                                        <img
                                                            className={styles.attachmentImage}
                                                            src={m.attachment.fileUrl}
                                                            alt={m.attachment.fileName}
                                                        />
                                                    </button>
                                                ) : (
                                                    <button
                                                        className={styles.attachmentLinkButton}
                                                        onClick={() => setPreviewAttachment(m.attachment || null)}
                                                        aria-label={`Open attachment ${m.attachment.fileName}`}
                                                    >
                                                        <span className={styles.attachmentFileIcon}>📎</span>
                                                        <span className={styles.attachmentLink}>
                                                        {m.attachment.fileName} · {formatBytes(m.attachment.fileSize)}
                                                        </span>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        <span className={styles.meta}>
                                            {mine ? 'You' : m.fromId}
                                            {m.optimistic ? ' · Sending…' : m.failed ? ' · Failed to send' : ` · ${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className={styles.composer}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.json,.zip,.rar,.webm,.mp3,.m4a,.wav,.ogg,image/*,audio/*,application/pdf,text/plain,text/markdown,text/csv,application/json,application/zip,application/x-rar-compressed,application/vnd.rar,audio/webm,audio/mpeg,audio/mp4,audio/wav,audio/ogg"
                            className={styles.fileInputHidden}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    void uploadFile(file);
                                }
                            }}
                        />
                        <button
                            className={styles.btn}
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading || normalizedToId.length !== 6}
                            aria-label="Attach file"
                            title="Attach file"
                        >
                            {uploading ? '…' : (
                                <svg className={styles.attachIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M16.5 6.75L8.91 14.34a3 3 0 104.24 4.24l8.13-8.13a5.25 5.25 0 10-7.42-7.42L4.97 11.9a7.5 7.5 0 1010.61 10.61l7.95-7.95" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </button>
                        <button
                            className={`${styles.btn} ${recordingVoice ? styles.iconBtnActive : ''}`}
                            type="button"
                            onClick={() => {
                                if (recordingVoice) {
                                    stopVoiceRecording();
                                } else {
                                    void startVoiceRecording();
                                }
                            }}
                            disabled={uploading || normalizedToId.length !== 6}
                            aria-label={recordingVoice ? 'Stop voice recording' : 'Record voice message'}
                            title={recordingVoice ? 'Stop voice recording' : 'Record voice message'}
                        >
                            {recordingVoice ? `■ ${formatDuration(recordingMs)}` : '🎤'}
                        </button>
                        <textarea
                            className={styles.messageInput}
                            placeholder="Type message..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            maxLength={500}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    void sendMessage();
                                }
                            }}
                        />
                        <button className={styles.btnPrimary} onClick={sendMessage} disabled={uploading || recordingVoice || text.trim().length === 0 || normalizedToId.length !== 6}>Send</button>
                    </div>
                    <div className={styles.composerHint}>
                        {recordingVoice
                            ? `Recording ${formatDuration(recordingMs)} • tap stop to send`
                            : 'Press Enter to send • Shift+Enter for a new line'}
                    </div>
                    {error && <div className={styles.hint}>{error}</div>}
                </section>
            )}

            {previewAttachment && (
                <div className={styles.previewOverlay} onClick={() => setPreviewAttachment(null)} role="presentation">
                    <div className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.previewHeader}>
                            <span className={styles.previewTitle} title={previewAttachment.fileName}>{previewAttachment.fileName}</span>
                            <button
                                className={styles.headerBtn}
                                onClick={() => setPreviewAttachment(null)}
                                aria-label="Close attachment preview"
                            >
                                ✕
                            </button>
                        </div>

                        <div className={styles.previewBody}>
                            {previewAttachment.mimeType.startsWith('image/') ? (
                                <img
                                    className={styles.previewImage}
                                    src={previewAttachment.fileUrl}
                                    alt={previewAttachment.fileName}
                                />
                            ) : (
                                <div className={styles.previewFileCard}>
                                    <div className={styles.previewFileIcon}>📄</div>
                                    <div className={styles.previewFileMeta}>
                                        <div>{previewAttachment.fileName}</div>
                                        <div>{formatBytes(previewAttachment.fileSize)}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={styles.previewActions}>
                            <a
                                className={styles.btnPrimary}
                                href={previewAttachment.fileUrl}
                                download={previewAttachment.fileName}
                            >
                                Download
                            </a>
                        </div>
                    </div>
                </div>
            )}

            <button
                ref={fabRef}
                className={`${styles.chatFab} ${open ? styles.chatFabOpen : ''}`}
                aria-label={open ? 'Close chat' : 'Open chat'}
                onClick={() => setOpen(prev => !prev)}
            >
                {!open && unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
                {open ? (
                    <span className={styles.fabCloseLabel}>✕ Close</span>
                ) : (
                    <span>💬</span>
                )}
            </button>
        </>
    );
}

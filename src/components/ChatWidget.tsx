'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './ChatWidget.module.css';

const DEVICE_STORAGE_KEY = 'tradesk-chat-device-id';
const COOKIE_CONSENT_KEY = 'tradesk-cookie-consent';
const DEVICE_ID_PATTERN = /^[a-f0-9]{32}$/;

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
}

export default function ChatWidget() {
    const [open, setOpen] = useState(false);
    const [myId, setMyId] = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [toId, setToId] = useState('');
    const [text, setText] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [cookiesAccepted, setCookiesAccepted] = useState(true);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const consent = localStorage.getItem(COOKIE_CONSENT_KEY) === 'accepted';
        setCookiesAccepted(consent);

        try {
            const localDeviceId = getOrCreateDeviceId();
            setDeviceId(localDeviceId);
        } catch {
            setError('Local storage is unavailable; chat ID may not persist');
        }
    }, []);

    useEffect(() => {
        if (!deviceId) return;
        loadIdentity();
    }, [deviceId, loadIdentity]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const supported = 'Notification' in window;
        setPushSupported(supported);
        if (!supported) return;
        setPushEnabled(Notification.permission === 'granted');
    }, []);

    const normalizedToId = useMemo(() => toId.trim().toLowerCase(), [toId]);

    const loadMessages = useCallback(async () => {
        if (normalizedToId.length !== 6) return;

        try {
            const res = await fetchWithIdentity(`/api/chat/messages?with=${normalizedToId}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to load messages');
            }

            if (!Array.isArray(data.messages)) return;

            setMessages(prev => {
                const prevLastId = prev.length > 0 ? prev[prev.length - 1].id : null;
                const nextMessages = data.messages as ChatMessage[];

                if (
                    pushEnabled &&
                    typeof window !== 'undefined' &&
                    'Notification' in window &&
                    Notification.permission === 'granted'
                ) {
                    const nextIncoming = nextMessages.filter((m) => {
                        if (m.fromId === myId) return false;
                        if (prevLastId == null) return false;
                        return m.id > prevLastId;
                    });

                    const shouldNotifyInForeground = !(open && document.visibilityState === 'visible');
                    if (nextIncoming.length > 0 && shouldNotifyInForeground) {
                        const newest = nextIncoming[nextIncoming.length - 1];
                        new Notification(`Message from ${newest.fromId}`, {
                            body: newest.message,
                            tag: `chat-${normalizedToId}`,
                        });
                    }
                }

                return nextMessages;
            });

            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load messages');
        }
    }, [fetchWithIdentity, myId, normalizedToId, open, pushEnabled]);

    useEffect(() => {
        if (!open || normalizedToId.length !== 6) return;

        let isActive = true;

        const safeLoad = async () => {
            if (!isActive) return;
            await loadMessages();
        };

        safeLoad();
        const timer = setInterval(safeLoad, 3000);

        return () => {
            isActive = false;
            clearInterval(timer);
        };
    }, [loadMessages, open, normalizedToId]);

    useEffect(() => {
        if (!listRef.current) return;
        listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages, open]);

    const sendMessage = async () => {
        if (normalizedToId.length !== 6 || text.trim().length === 0) return;

        try {
            const res = await fetchWithIdentity('/api/chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toId: normalizedToId,
                    message: text,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to send message');
            }

            setText('');
            await loadMessages();
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send message');
        }
    };

    const togglePush = async () => {
        if (!pushSupported || typeof window === 'undefined' || !('Notification' in window)) {
            setError('Push notifications are not supported in this browser');
            return;
        }

        if (pushEnabled) {
            setPushEnabled(false);
            return;
        }

        if (Notification.permission === 'granted') {
            setPushEnabled(true);
            setError(null);
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            setPushEnabled(true);
            setError(null);
            return;
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

    const panelClassName = `${styles.chatPanel} ${fullscreen ? styles.fullscreen : ''}`;

    return (
        <>
            {open && (
                <section className={panelClassName} aria-label="Chat panel">
                    <div className={styles.header}>
                        <div>
                            <div className={styles.title}>Direct Chat</div>
                            <div className={styles.myId}>Your ID: {myId || '...'}</div>
                        </div>
                        <div className={styles.headerActions}>
                            <button className={styles.headerBtn} onClick={() => setFullscreen(prev => !prev)} aria-label="Toggle fullscreen">
                                {fullscreen ? '🗗' : '🗖'}
                            </button>
                            <button className={styles.headerBtn} onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
                        </div>
                    </div>

                    <div className={styles.controls}>
                        <input
                            className={styles.input}
                            placeholder="Recipient ID (e.g. e8f2s4)"
                            value={toId}
                            onChange={(e) => setToId(e.target.value)}
                            maxLength={6}
                        />
                        <button className={styles.btn} onClick={loadMessages} disabled={normalizedToId.length !== 6}>Refresh</button>
                        <button className={styles.btn} onClick={togglePush}>
                            {pushSupported ? (pushEnabled ? 'Push On' : 'Push Off') : 'Push N/A'}
                        </button>
                        <button className={styles.btn} onClick={() => setMessages([])}>Clear</button>
                    </div>

                    {!cookiesAccepted && (
                        <div className={styles.cookieBanner}>
                            <span>Accept cookies to keep your chat ID stable across refreshes.</span>
                            <button className={styles.btnPrimary} onClick={acceptCookies}>Accept Cookies</button>
                        </div>
                    )}

                    <div className={styles.messages} ref={listRef}>
                        {normalizedToId.length !== 6 ? (
                            <div className={styles.empty}>Enter a 6-character recipient ID to start chatting.</div>
                        ) : messages.length === 0 ? (
                            <div className={styles.empty}>No messages yet.</div>
                        ) : (
                            messages.map((m) => {
                                const mine = m.fromId === myId;
                                return (
                                    <div
                                        key={m.id}
                                        className={`${styles.bubble} ${mine ? styles.mine : styles.theirs}`}
                                    >
                                        <div>{m.message}</div>
                                        <span className={styles.meta}>
                                            {mine ? 'You' : m.fromId} · {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className={styles.composer}>
                        <textarea
                            className={styles.textarea}
                            placeholder="Type message..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            maxLength={500}
                        />
                        <button className={styles.btnPrimary} onClick={sendMessage}>Send</button>
                    </div>
                    {error && <div className={styles.hint}>{error}</div>}
                </section>
            )}

            <button
                className={styles.chatFab}
                aria-label="Open chat"
                onClick={() => setOpen(prev => !prev)}
            >
                💬
            </button>
        </>
    );
}

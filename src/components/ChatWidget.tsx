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

export default function ChatWidget() {
    const [open, setOpen] = useState(false);
    const [myId, setMyId] = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [toId, setToId] = useState('');
    const [contacts, setContacts] = useState<ChatContact[]>([]);
    const [newContactName, setNewContactName] = useState('');
    const [newContactId, setNewContactId] = useState('');
    const [text, setText] = useState('');
    const [uploading, setUploading] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [cookiesAccepted, setCookiesAccepted] = useState(true);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLElement>(null);
    const fabRef = useRef<HTMLButtonElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        } catch {
            setError('Local storage is unavailable; chat ID may not persist');
        }
    }, []);

    useEffect(() => {
        if (!deviceId) return;
        loadIdentity();
        loadContacts();
    }, [deviceId, loadContacts, loadIdentity]);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: PointerEvent) => {
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
    }, [open]);

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

        if ('serviceWorker' in navigator && pushEnabled) {
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await subscription.unsubscribe();
                    await fetch('/api/notifications/subscribe', {
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

        if (Notification.permission === 'granted') {
            setPushEnabled(true);
            setError(null);
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                try {
                    const registration = await navigator.serviceWorker.register('/sw.js');
                    const ready = await navigator.serviceWorker.ready;
                    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

                    if (publicKey) {
                        const keyBytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
                        const subscription = await ready.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: keyBytes,
                        });

                        await fetch('/api/notifications/subscribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ subscription }),
                        });
                    }

                    void registration;
                } catch {
                    setError('Notifications enabled, but push subscription setup failed');
                }
            }
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

            await loadMessages();
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
                        <select
                            className={styles.input}
                            value={normalizedToId}
                            onChange={(e) => setToId(e.target.value)}
                        >
                            <option value="">Select contact…</option>
                            {contacts.map(contact => (
                                <option key={contact.id} value={contact.contactId}>
                                    {contact.displayName} ({contact.contactId})
                                </option>
                            ))}
                        </select>
                        <input
                            className={styles.input}
                            placeholder="Recipient ID (e.g. e8f2s4)"
                            value={toId}
                            onChange={(e) => setToId(e.target.value)}
                            maxLength={6}
                        />
                        <button className={styles.btn} onClick={loadMessages} disabled={normalizedToId.length !== 6}>Refresh</button>
                        <button
                            className={`${styles.iconToggle} ${pushEnabled ? styles.iconOn : styles.iconOff}`}
                            onClick={togglePush}
                            aria-label={pushEnabled ? 'Notifications enabled' : 'Notifications muted'}
                            title={pushEnabled ? 'Notifications enabled' : 'Notifications muted'}
                        >
                            {pushEnabled ? '🔔' : '🔕'}
                        </button>
                        <button className={styles.btn} onClick={() => setMessages([])}>Clear</button>
                    </div>

                    <div className={styles.newContactRow}>
                        <input
                            className={styles.input}
                            placeholder="New contact name"
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
                        <button className={styles.btn} onClick={saveContact}>New Contact</button>
                    </div>

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
                                        {m.attachment && (
                                            <div className={styles.attachmentWrap}>
                                                {m.attachment.mimeType.startsWith('image/') ? (
                                                    <a href={m.attachment.fileUrl} target="_blank" rel="noreferrer">
                                                        <img
                                                            className={styles.attachmentImage}
                                                            src={m.attachment.fileUrl}
                                                            alt={m.attachment.fileName}
                                                        />
                                                    </a>
                                                ) : (
                                                    <a className={styles.attachmentLink} href={m.attachment.fileUrl} target="_blank" rel="noreferrer">
                                                        {m.attachment.fileName}
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                        <span className={styles.meta}>
                                            {mine ? 'You' : m.fromId} · {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                            accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.txt,.md,.csv,.json,.zip,.rar,image/*,application/pdf,text/plain,text/markdown,text/csv,application/json,application/zip,application/x-rar-compressed,application/vnd.rar"
                            className={styles.fileInput}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    void uploadFile(file);
                                }
                            }}
                        />
                        <textarea
                            className={styles.textarea}
                            placeholder="Type message..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            maxLength={500}
                        />
                        <button className={styles.btnPrimary} onClick={sendMessage} disabled={uploading}>Send</button>
                    </div>
                    {error && <div className={styles.hint}>{error}</div>}
                </section>
            )}

            <button
                ref={fabRef}
                className={styles.chatFab}
                aria-label="Open chat"
                onClick={() => setOpen(prev => !prev)}
            >
                💬
            </button>
        </>
    );
}

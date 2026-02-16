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

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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
    const [selectedFileName, setSelectedFileName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [cookiesAccepted, setCookiesAccepted] = useState(true);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
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

                const nextIncoming = nextMessages.filter((m) => {
                    if (m.fromId === myId) return false;
                    if (prevLastId == null) return false;
                    return m.id > prevLastId;
                });

                if (nextIncoming.length > 0) {
                    const shouldNotifyInForeground = !(open && document.visibilityState === 'visible');

                    if (shouldNotifyInForeground) {
                        setUnreadCount((count) => count + nextIncoming.length);
                    }

                    if (
                        pushEnabled &&
                        typeof window !== 'undefined' &&
                        'Notification' in window &&
                        Notification.permission === 'granted' &&
                        shouldNotifyInForeground
                    ) {
                        const newest = nextIncoming[nextIncoming.length - 1];
                        const senderContact = contacts.find(contact => contact.contactId === newest.fromId)?.displayName;
                        const senderLabel = senderContact || newest.fromId;
                        new Notification(`Message from ${senderLabel}`, {
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
    }, [contacts, fetchWithIdentity, myId, normalizedToId, open, pushEnabled]);

    useEffect(() => {
        if (normalizedToId.length !== 6) return;

        let isActive = true;

        const safeLoad = async () => {
            if (!isActive) return;
            await loadMessages();
        };

        safeLoad();
        const timer = setInterval(safeLoad, open ? 3000 : 8000);

        return () => {
            isActive = false;
            clearInterval(timer);
        };
    }, [loadMessages, open, normalizedToId]);

    useEffect(() => {
        if (open) {
            setUnreadCount(0);
        }
    }, [open]);

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

            await loadMessages();
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload file');
        } finally {
            setUploading(false);
            setSelectedFileName('');
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
                                {fullscreen ? '🗗' : '🗖'}
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
                            <button className={styles.btn} onClick={loadMessages} disabled={normalizedToId.length !== 6}>Refresh</button>
                        </div>

                        <div className={styles.actionsRow}>
                            <button className={styles.btn} onClick={() => setShowNewContact(prev => !prev)}>
                                {showNewContact ? 'Hide Contact Form' : 'New Contact'}
                            </button>
                            <button
                                className={`${styles.iconToggle} ${pushEnabled ? styles.iconOn : styles.iconOff}`}
                                onClick={togglePush}
                                aria-label={pushEnabled ? 'Notifications enabled' : 'Notifications muted'}
                                title={pushEnabled ? 'Notifications enabled' : 'Notifications muted'}
                            >
                                {pushEnabled ? '🔔' : '🔕'}
                            </button>
                            <button className={styles.btn} onClick={() => setMessages([])}>Clear Chat</button>
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

                    <div className={styles.messages} ref={listRef}>
                        {normalizedToId.length !== 6 ? (
                            <div className={styles.empty}>Choose a contact or enter a 6-character recipient ID to start chatting.</div>
                        ) : messages.length === 0 ? (
                            <div className={styles.empty}>No messages yet. Send a message or share a file to begin.</div>
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
                                                        {m.attachment.fileName} · {formatBytes(m.attachment.fileSize)}
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
                            accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.json,.zip,.rar,image/*,application/pdf,text/plain,text/markdown,text/csv,application/json,application/zip,application/x-rar-compressed,application/vnd.rar"
                            className={styles.fileInputHidden}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setSelectedFileName(file.name);
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
                        {selectedFileName && <span className={styles.fileName} title={selectedFileName}>{selectedFileName}</span>}
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
                        <button className={styles.btnPrimary} onClick={sendMessage} disabled={uploading || text.trim().length === 0 || normalizedToId.length !== 6}>Send</button>
                    </div>
                    <div className={styles.composerHint}>
                        Press Enter to send • Shift+Enter for a new line
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
                {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
                💬
            </button>
        </>
    );
}

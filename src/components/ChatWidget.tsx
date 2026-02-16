'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './ChatWidget.module.css';

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
    const [toId, setToId] = useState('');
    const [text, setText] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetch('/api/chat/id')
            .then(r => r.json())
            .then(data => {
                if (typeof data?.id === 'string') {
                    setMyId(data.id);
                }
            })
            .catch(() => {
                setError('Failed to load your chat ID');
            });
    }, []);

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
            const res = await fetch(`/api/chat/messages?with=${normalizedToId}`);
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
    }, [myId, normalizedToId, open, pushEnabled]);

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
            const res = await fetch('/api/chat/messages', {
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

    return (
        <>
            {open && (
                <section className={styles.chatPanel} aria-label="Chat panel">
                    <div className={styles.header}>
                        <div>
                            <div className={styles.title}>Direct Chat</div>
                            <div className={styles.myId}>Your ID: {myId || '...'}</div>
                        </div>
                        <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
                    </div>

                    <div className={styles.controls}>
                        <input
                            className={styles.input}
                            placeholder="Recipient ID (e.g. e8f2s4)"
                            value={toId}
                            onChange={(e) => setToId(e.target.value)}
                            maxLength={6}
                        />
                        <button onClick={loadMessages} disabled={normalizedToId.length !== 6}>Refresh</button>
                        <button onClick={togglePush}>
                            {pushSupported ? (pushEnabled ? 'Push On' : 'Push Off') : 'Push N/A'}
                        </button>
                        <button onClick={() => setMessages([])}>Clear</button>
                    </div>

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
                        <button onClick={sendMessage}>Send</button>
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

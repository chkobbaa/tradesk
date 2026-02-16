'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

    const normalizedToId = useMemo(() => toId.trim().toLowerCase(), [toId]);

    useEffect(() => {
        if (!open || normalizedToId.length !== 6) return;

        let isActive = true;

        const loadMessages = async () => {
            try {
                const res = await fetch(`/api/chat/messages?with=${normalizedToId}`);
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data?.error || 'Failed to load messages');
                }
                if (isActive && Array.isArray(data.messages)) {
                    setMessages(data.messages);
                    setError(null);
                }
            } catch (err) {
                if (isActive) {
                    setError(err instanceof Error ? err.message : 'Failed to load messages');
                }
            }
        };

        loadMessages();
        const timer = setInterval(loadMessages, 3000);

        return () => {
            isActive = false;
            clearInterval(timer);
        };
    }, [open, normalizedToId]);

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

            const next = await fetch(`/api/chat/messages?with=${normalizedToId}`);
            const nextData = await next.json();
            if (next.ok && Array.isArray(nextData.messages)) {
                setMessages(nextData.messages);
            }
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send message');
        }
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

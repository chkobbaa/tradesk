'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './page.module.css';

function LoginForm() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Authentication failed');
                setLoading(false);
                return;
            }

            const from = searchParams.get('from') || '/';
            router.push(from);
            router.refresh();
        } catch {
            setError('Network error');
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className={styles.form}>
            <input
                type="password"
                className={styles.input}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
            />
            {error && <div className={styles.error}>{error}</div>}
            <button
                type="submit"
                className={styles.btn}
                disabled={loading || !password}
            >
                {loading ? 'Verifying...' : 'Unlock'}
            </button>
        </form>
    );
}

export default function LoginPage() {
    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.logo}>
                    <div className={styles.logoDot} />
                    <h1 className={styles.logoText}>TraDesk</h1>
                </div>
                <p className={styles.subtitle}>Enter password to continue</p>

                <Suspense fallback={
                    <div className={styles.form}>
                        <input type="password" className={styles.input} placeholder="Password" disabled />
                        <button className={styles.btn} disabled>Unlock</button>
                    </div>
                }>
                    <LoginForm />
                </Suspense>

                <p className={styles.hint}>
                    Protected deployment · SHA-256
                </p>
            </div>
        </div>
    );
}

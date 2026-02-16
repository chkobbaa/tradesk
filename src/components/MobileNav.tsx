'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './MobileNav.module.css';

const NAV_ITEMS = [
    { href: '/', label: 'Market' },
    { href: '/charts', label: 'Charts' },
    { href: '/trades', label: 'Trades' },
    { href: '/stats', label: 'Stats' },
    { href: '/mobile', label: 'Mobile' },
];

export default function MobileNav() {
    const pathname = usePathname();

    return (
        <nav className={styles.mobileNav} aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => {
                const isActive = item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}

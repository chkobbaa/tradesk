import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
    title: 'TraDesk Mobile — Bot Monitor',
    description: 'Mobile dashboard for monitoring the TraDesk trading bot.',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export default function MobileLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div style={{ marginLeft: 0, padding: 0 }} className="mobile-override">
            <style>{`
                .mobile-override { margin-left: 0 !important; }
                .mobile-override ~ .sidebar,
                .app-layout > aside { display: none !important; }
                .main-content { margin-left: 0 !important; padding: 0 !important; }
            `}</style>
            {children}
        </div>
    );
}

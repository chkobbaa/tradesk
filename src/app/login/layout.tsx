export default function LoginLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
            <style>{`
                .app-layout > aside { display: none !important; }
                .main-content { margin-left: 0 !important; padding: 0 !important; }
            `}</style>
            {children}
        </div>
    );
}

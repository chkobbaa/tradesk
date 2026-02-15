// Service Worker for Push Notifications — TraDesk Shadow Bot

self.addEventListener('push', function (event) {
    const data = event.data ? event.data.json() : {};

    const title = data.title || 'TraDesk Bot';
    const options = {
        body: data.body || 'New activity from Shadow Bot',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: data.tag || 'tradesk-notification',
        data: {
            url: data.url || '/mobile'
        },
        vibrate: [200, 100, 200],
        requireInteraction: false,
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const url = event.notification.data?.url || '/mobile';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (clientList) {
                for (const client of clientList) {
                    if (client.url.includes('/mobile') && 'focus' in client) {
                        return client.focus();
                    }
                }
                return clients.openWindow(url);
            })
    );
});

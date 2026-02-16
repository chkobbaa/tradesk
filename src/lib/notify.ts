
import webpush from 'web-push';
import { deletePushSubscription, getAllPushSubscriptions, getPushSubscriptionsByUser } from '@/db';

/**
 * Send a push notification to all subscribed devices.
 * Automatically removes expired/invalid subscriptions.
 */
export async function sendPushNotification(
    title: string,
    body: string,
    tag?: string,
    url?: string
): Promise<{ sent: number; failed: number }> {
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublic || !vapidPrivate) {
        console.warn('[Push] VAPID keys not configured, skipping notification');
        return { sent: 0, failed: 0 };
    }

    webpush.setVapidDetails(
        'mailto:tradesk@bahroun.me',
        vapidPublic,
        vapidPrivate
    );

    const subscriptions = await getAllPushSubscriptions();
    let sent = 0;
    let failed = 0;

    const payload = JSON.stringify({ title, body, tag, url: url || '/mobile' });

    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification(sub.subscription, payload);
            sent++;
        } catch (err: unknown) {
            // 404 or 410 = subscription expired/invalid
            const statusCode =
                typeof err === 'object' && err !== null && 'statusCode' in err
                    ? (err as { statusCode?: number }).statusCode
                    : undefined;

            if (statusCode === 404 || statusCode === 410) {
                await deletePushSubscription(sub.endpoint);
            }
            failed++;
        }
    }

    return { sent, failed };
}

export async function sendDirectChatPushNotification(options: {
    recipientUserId: string;
    senderName: string;
    preview: string;
    excludeDeviceId?: string;
}): Promise<{ sent: number; failed: number }> {
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

    if (!vapidPublic || !vapidPrivate) {
        console.warn('[Push] VAPID keys not configured, skipping notification');
        return { sent: 0, failed: 0 };
    }

    webpush.setVapidDetails(
        'mailto:tradesk@bahroun.me',
        vapidPublic,
        vapidPrivate,
    );

    const subscriptions = await getPushSubscriptionsByUser(options.recipientUserId);
    const filtered = options.excludeDeviceId
        ? subscriptions.filter(sub => sub.deviceId !== options.excludeDeviceId)
        : subscriptions;

    let sent = 0;
    let failed = 0;

    const payload = JSON.stringify({
        title: `Message from ${options.senderName}`,
        body: options.preview,
        tag: `chat-user-${options.recipientUserId}`,
        url: '/mobile',
    });

    for (const sub of filtered) {
        try {
            await webpush.sendNotification(sub.subscription, payload);
            sent++;
        } catch (err: unknown) {
            const statusCode =
                typeof err === 'object' && err !== null && 'statusCode' in err
                    ? (err as { statusCode?: number }).statusCode
                    : undefined;

            if (statusCode === 404 || statusCode === 410) {
                await deletePushSubscription(sub.endpoint);
            }
            failed++;
        }
    }

    return { sent, failed };
}

// ============================================================
// УСТАНОВКА И АКТИВАЦИЯ
// ============================================================

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim())
})

// ============================================================
// ОБРАБОТКА PUSH-УВЕДОМЛЕНИЙ
// ============================================================

self.addEventListener('push', (event) => {
    let data = {}

    try {
        data = event.data.json()
    } catch (error) {
        console.error('Ошибка парсинга push данных:', error)
        data = {
            title: 'Новое уведомление',
            body: 'У вас новое уведомление',
            url: '/events.html'
        }
    }

    const options = {
        body: data.body || 'У вас новое уведомление',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/events.html',
            eventId: data.eventId || null,
            timestamp: Date.now()
        },
        actions: [
            { action: 'open', title: '📖 Открыть' },
            { action: 'close', title: '❌ Закрыть' }
        ],
        tag: data.eventId ? `event-${data.eventId}` : 'notification',
        renotify: true,
        requireInteraction: true
    }

    event.waitUntil(
        self.registration.showNotification(
            data.title || '🏐 Beach Pro Tool',
            options
        )
    )
})

// ============================================================
// ОБРАБОТКА КЛИКОВ ПО УВЕДОМЛЕНИЯМ
// ============================================================

self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    if (event.action === 'close') return

    const url = event.notification.data?.url || '/events.html'
    const eventId = event.notification.data?.eventId

    // Формируем URL с параметром eventId для якоря
    let fullUrl = url;
    if (eventId) {
        // Убираем старые параметры и добавляем eventId
        const baseUrl = url.split('?')[0];
        fullUrl = `${baseUrl}?eventId=${eventId}`;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Ищем уже открытую вкладку с нашим origin
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        client.navigate(fullUrl);
                        return;
                    }
                }
                // Открываем новую вкладку
                return clients.openWindow(fullUrl);
            })
    )
})
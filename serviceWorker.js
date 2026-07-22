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
        tag: data.eventId || 'notification',
        renotify: true,
        requireInteraction: true
    }

    event.waitUntil(
        self.registration.showNotification(
            data.title || '🏐 Volleyball App',
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

    let fullUrl = url
    if (eventId && !url.includes('id=')) {
        const separator = url.includes('?') ? '&' : '?'
        fullUrl = `${url}${separator}id=${eventId}`
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus()
                        client.navigate(fullUrl)
                        return
                    }
                }
                return clients.openWindow(fullUrl)
            })
    )
})
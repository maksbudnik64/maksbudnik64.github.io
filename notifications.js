class PushNotifications {
    constructor() {
        this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window
        this.swRegistration = null
        this.vapidPublicKey = null
        this.isSubscribed = false
    }

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================

    async init() {
        if (!this.isSupported) {
            console.warn('Push уведомления не поддерживаются')
            return false
        }

        try {
            await this.fetchVapidKey()

            if (!this.vapidPublicKey) {
                console.error('Не удалось получить VAPID ключ')
                return false
            }

            this.swRegistration = await navigator.serviceWorker.register('/serviceWorker.js', {
                scope: '/'
            })

            await navigator.serviceWorker.ready

            const subscription = await this.swRegistration.pushManager.getSubscription()
            this.isSubscribed = !!subscription

            if (subscription) {
                await this.sendSubscriptionToServer(subscription)
            }

            return true
        } catch (error) {
            console.error('Ошибка инициализации:', error)
            return false
        }
    }

    async fetchVapidKey() {
        try {
            const response = await fetch('/api/push/vapid-public-key')
            const data = await response.json()
            this.vapidPublicKey = data.publicKey
            return this.vapidPublicKey
        } catch (error) {
            console.error('Ошибка получения VAPID ключа:', error)
            return null
        }
    }

    // ============================================================
    // ПОДПИСКА / ОТПИСКА
    // ============================================================

    async subscribe() {
        if (!this.isSupported) return false

        try {
            const permission = await Notification.requestPermission()
            if (permission !== 'granted') return false

            if (!this.swRegistration) {
                await this.init()
            }

            const subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.vapidPublicKey
            })

            const result = await this.sendSubscriptionToServer(subscription)
            if (result.success) {
                this.isSubscribed = true
                return true
            }

            return false
        } catch (error) {
            console.error('Ошибка подписки:', error)
            return false
        }
    }

    async unsubscribe() {
        if (!this.isSupported || !this.swRegistration) return false

        try {
            const subscription = await this.swRegistration.pushManager.getSubscription()
            if (subscription) {
                await subscription.unsubscribe()
                await this.sendSubscriptionToServer(null)
                this.isSubscribed = false
                return true
            }
            return false
        } catch (error) {
            console.error('Ошибка отписки:', error)
            return false
        }
    }

    async sendSubscriptionToServer(subscription) {
        try {
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ subscription })
            })
            return await response.json()
        } catch (error) {
            console.error('Ошибка отправки подписки:', error)
            return { success: false }
        }
    }

    // ============================================================
    // НАСТРОЙКИ
    // ============================================================

    async getNotificationSettings() {
        try {
            const response = await fetch('/api/push/settings', {
                credentials: 'include'
            })
            const data = await response.json()
            return data.enabled
        } catch (error) {
            console.error('Ошибка получения настроек:', error)
            return true
        }
    }

    async updateNotificationSettings(enabled) {
        try {
            const response = await fetch('/api/push/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ enabled })
            })
            const data = await response.json()
            return data.success
        } catch (error) {
            console.error('Ошибка обновления настроек:', error)
            return false
        }
    }

    // ============================================================
    // ПРОВЕРКА И ТЕСТИРОВАНИЕ
    // ============================================================

    async checkSubscription() {
        if (!this.isSupported || !this.swRegistration) return false

        try {
            const subscription = await this.swRegistration.pushManager.getSubscription()
            this.isSubscribed = !!subscription
            return this.isSubscribed
        } catch (error) {
            console.error('Ошибка проверки подписки:', error)
            return false
        }
    }

    async sendTestNotification() {
        try {
            const response = await fetch('/api/push/test', {
                method: 'POST',
                credentials: 'include'
            })
            return await response.json()
        } catch (error) {
            console.error('Ошибка отправки теста:', error)
            return { success: false }
        }
    }
}

export const notifications = new PushNotifications()
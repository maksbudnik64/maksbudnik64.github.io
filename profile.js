import { checkAuth, logout, updateUserCard } from './auth.js'
import { apiGet, apiPut } from './api.js'
import { ProfileCard } from './profileCards.js'
import { notifications } from './notifications.js'

let notificationToggleBtn = null
let notificationIcon = null
let notificationText = null
let isOwnProfile = false

// ============================================================
// ЗАГРУЗКА ПРОФИЛЯ
// ============================================================

async function loadProfile() {
    const currentUser = await checkAuth()
    if (!currentUser) return

    updateUserCard(currentUser)

    const urlParams = new URLSearchParams(window.location.search)
    let profileId = urlParams.get('id') || currentUser.userId

    const { user, isOwner } = await apiGet(`/user/${profileId}`)
    isOwnProfile = isOwner

    const profileCardContainer = document.getElementById('profile-card-container')
    if (profileCardContainer) profileCardContainer.innerHTML = new ProfileCard(user).render()

    const editBtn = document.getElementById('edit-profile-btn')
    const logoutBtn = document.getElementById('logout-profile-btn')
    notificationToggleBtn = document.getElementById('notification-toggle-btn')

    if (isOwner) {
        editBtn.style.display = 'inline-flex'
        logoutBtn.style.display = 'inline-flex'

        if (notificationToggleBtn) {
            notificationToggleBtn.style.display = 'flex'
            await initNotifications()
        }

        document.querySelector('.topBarText p').innerHTML =
            `<i class="fas fa-user" style="color:#c49a2c;"></i> ${user.name} · ${user.position || 'Игрок'}`
    } else {
        editBtn.style.display = 'none'
        logoutBtn.style.display = 'none'

        if (notificationToggleBtn) {
            notificationToggleBtn.style.display = 'none'
        }

        document.querySelector('.topBarText p').innerHTML =
            `<i class="fas fa-user" style="color:#c49a2c;"></i> Профиль игрока ${user.name}`
    }

    logoutBtn?.addEventListener('click', logout)

    const editModal = document.getElementById('edit-profile-modal')
    const editForm = document.getElementById('edit-profile-form')

    editBtn?.addEventListener('click', async () => {
        const { user } = await apiGet(`/user/${currentUser.userId}`)
        editForm.elements['name'].value = user.name || ''
        editForm.elements['surname'].value = user.surname || ''
        editForm.elements['gender'].value = user.gender || 'male'
        editForm.elements['city'].value = user.city || ''
        editForm.elements['dateOfBirth'].value = user.dateOfBirth ? user.dateOfBirth.slice(0, 10) : ''
        editForm.elements['height'].value = user.height || ''
        editForm.elements['position'].value = user.position || ''
        editForm.elements['level'].value = user.level || ''
        editForm.elements['oldPassword'].value = ''
        editForm.elements['newPassword'].value = ''
        editModal.style.display = 'block'
    })

    // Закрытие модальных окон
    document.querySelectorAll('.close-modal').forEach(b =>
        b.addEventListener('click', () => b.closest('.modal').style.display = 'none')
    )
    window.addEventListener('click', e => {
        if (e.target.classList.contains('modal')) e.target.style.display = 'none'
    })

    editForm?.addEventListener('submit', async (e) => {
        e.preventDefault()
        const formData = new FormData(editForm)
        const data = Object.fromEntries(formData)
        if (!data.oldPassword && !data.newPassword) {
            delete data.oldPassword
            delete data.newPassword
        }

        try {
            const result = await apiPut(`/user/${currentUser.userId}`, data)
            editModal.style.display = 'none'
            if (profileCardContainer) profileCardContainer.innerHTML = new ProfileCard(result.user).render()
            updateUserCard(result.user)
            if (isOwnProfile && notificationToggleBtn) {
                await updateNotificationStatus()
            }
        } catch (error) {
            alert(error.message || 'Ошибка сохранения')
        }
    })
}

// ============================================================
// УВЕДОМЛЕНИЯ
// ============================================================

async function initNotifications() {
    notificationToggleBtn = document.getElementById('notification-toggle-btn')
    notificationIcon = document.getElementById('notification-icon')
    notificationText = document.getElementById('notification-text')

    if (!notificationToggleBtn) {
        console.warn('Кнопка уведомлений не найдена')
        return
    }

    try {
        const initialized = await notifications.init()

        if (!initialized) {
            notificationToggleBtn.style.display = 'none'
            return
        }

        if (!('Notification' in window)) {
            notificationToggleBtn.style.display = 'none'
            return
        }

        notificationToggleBtn.style.display = 'flex'
        notificationToggleBtn.disabled = true

        const enabled = await notifications.getNotificationSettings()
        const subscribed = await notifications.checkSubscription()

        updateNotificationUI(enabled, subscribed)
        notificationToggleBtn.disabled = false

        notificationToggleBtn.removeEventListener('click', handleNotificationToggle)
        notificationToggleBtn.addEventListener('click', handleNotificationToggle)

    } catch (error) {
        console.error('Ошибка инициализации уведомлений:', error)
        notificationToggleBtn.style.display = 'none'
    }
}

function updateNotificationUI(enabled, subscribed) {
    if (!notificationToggleBtn || !notificationIcon || !notificationText) return

    if (enabled && subscribed) {
        notificationToggleBtn.className = 'buttonAccent'
        notificationIcon.className = 'fas fa-bell'
        notificationText.textContent = 'Уведомления включены'
        notificationToggleBtn.title = 'Нажмите, чтобы выключить уведомления'
    } else {
        notificationToggleBtn.className = ''
        notificationIcon.className = 'fas fa-bell-slash'
        notificationText.textContent = 'Уведомления выключены'
        notificationToggleBtn.title = 'Нажмите, чтобы включить уведомления'
    }
}

async function handleNotificationToggle() {
    if (!notificationToggleBtn) return

    notificationToggleBtn.disabled = true

    try {
        const currentEnabled = await notifications.getNotificationSettings()
        const newEnabled = !currentEnabled

        if (newEnabled) {
            const subscribed = await notifications.subscribe()
            if (!subscribed) {
                alert('⚠️ Не удалось включить уведомления.\n\nРазрешите уведомления в браузере и попробуйте снова.')
                notificationToggleBtn.disabled = false
                return
            }
        } else {
            await notifications.unsubscribe()
        }

        await notifications.updateNotificationSettings(newEnabled)

        const updatedEnabled = await notifications.getNotificationSettings()
        const updatedSubscribed = await notifications.checkSubscription()
        updateNotificationUI(updatedEnabled, updatedSubscribed)

    } catch (error) {
        console.error('Ошибка:', error)
        alert('❌ Ошибка при изменении настроек уведомлений')
    } finally {
        notificationToggleBtn.disabled = false
    }
}

async function updateNotificationStatus() {
    if (!notificationToggleBtn || !isOwnProfile) return

    try {
        const enabled = await notifications.getNotificationSettings()
        const subscribed = await notifications.checkSubscription()
        updateNotificationUI(enabled, subscribed)
    } catch (error) {
        console.error('Ошибка обновления статуса уведомлений:', error)
    }
}

async function checkNotificationStatus() {
    if (!isOwnProfile || !notificationToggleBtn) return

    try {
        const enabled = await notifications.getNotificationSettings()
        const subscribed = await notifications.checkSubscription()
        updateNotificationUI(enabled, subscribed)
    } catch (error) {
        console.error('Ошибка проверки статуса:', error)
    }
}

// ============================================================
// ЗАПУСК
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadProfile()

    if (isOwnProfile && notificationToggleBtn) {
        setInterval(async () => {
            if (document.visibilityState === 'visible') {
                await checkNotificationStatus()
            }
        }, 30000)
    }
})

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && isOwnProfile) {
        await checkNotificationStatus()
    }
})
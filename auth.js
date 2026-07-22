import { apiGet, apiPost } from './api.js'

export async function checkAuth() {
    try {
        const data = await apiGet('/me')
        return data.user || null
    } catch (error) {
        if (error.status === 401) return null
        throw error
    }
}

export async function logout() {
    try {
        await apiPost('/logout')
    } catch (error) {
        console.error('Ошибка выхода:', error)
    }
    window.location.href = 'login.html'
}

// Обновляет данные пользователя в интерфейсе: сайдбар, data-js атрибуты, верхнюю панель
export function updateUserCard(user) {
    if (!user) return

    const initials = `${(user.name || '')[0]}${(user.surname || '')[0]}`.toUpperCase()
    const fullName = `${user.name || ''} ${user.surname || ''}`
    const role = `${user.position || 'Игрок'} / ${user.elo || 1000} elo`

    document.querySelectorAll('.sideBar .userAvatar, [data-js-user-avatar]').forEach(el => {
        el.textContent = initials
    })

    document.querySelectorAll('.sideBar .userName, [data-js-user-name]').forEach(el => {
        el.textContent = fullName
    })

    document.querySelectorAll('.sideBar .userRole, [data-js-user-role]').forEach(el => {
        el.textContent = role
    })

    const topBarP = document.querySelector('.topBarText p')
    if (topBarP) {
        const icon = topBarP.querySelector('.fa-user')
        if (icon) {
            topBarP.innerHTML = `<i class="fas fa-user" style="color:#c49a2c;"></i> ${fullName} · ${user.position || 'Игрок'}`
        }
    }

    const greeting = document.querySelector('[data-js-greeting]')
    if (greeting) {
        greeting.textContent = `Добрый день, ${user.name}`
    }
}
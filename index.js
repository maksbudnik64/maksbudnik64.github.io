import { checkAuth, logout, updateUserCard } from './auth.js'
import { apiGet } from './api.js'
import { createEventCard } from './eventCards.js'

async function initIndexPage() {
    const user = await checkAuth()
    if (!user) {
        window.location.href = 'login.html'
        return
    }

    updateUserCard(user)
    await loadNearestEvent(user)
    await loadProfileMiniCard(user)

    const logoutBtn = document.querySelector('[data-js-logout-button]')
    if (logoutBtn) logoutBtn.addEventListener('click', logout)
}

// ============================================================
// БЛИЖАЙШЕЕ СОБЫТИЕ
// ============================================================

async function loadNearestEvent(user) {
    const mainBoard = document.querySelector('.mainBoard')
    if (!mainBoard) return

    const nearestGameCard = mainBoard.querySelector('.card:first-child')
    if (!nearestGameCard) return

    try {
        const { events } = await apiGet('/events')

        const now = new Date()
        const upcoming = events
            .filter(e => {
                const datePart = e.eventDate.split('T')[0]
                const eventDate = new Date(`${datePart}T${e.eventTime || '00:00'}`)
                return eventDate > now &&
                       (e.status === 'confirmed' || e.status === 'pending') &&
                       e.status !== 'cancelled'
            })
            .sort((a, b) => {
                if (a.status === 'confirmed' && b.status !== 'confirmed') return -1
                if (a.status !== 'confirmed' && b.status === 'confirmed') return 1
                const dateA = new Date(`${a.eventDate.split('T')[0]}T${a.eventTime || '00:00'}`)
                const dateB = new Date(`${b.eventDate.split('T')[0]}T${b.eventTime || '00:00'}`)
                return dateA - dateB
            })

        if (upcoming.length === 0) {
            nearestGameCard.innerHTML = `
                <div style="text-align:center;padding:40px;">
                    <div style="font-size:3rem;margin-bottom:12px;">📅</div>
                    <div style="font-weight:700;font-size:1.2rem;margin-bottom:8px;">Нет ближайших событий</div>
                    <div style="color:#6b7583;margin-bottom:16px;">Создайте событие или запишитесь в существующее</div>
                    <a href="createEvent.html"><button class="buttonAccent"><i class="fas fa-plus-circle"></i> Создать событие</button></a>
                </div>`
            updateTopBarSubtitle(null)
            return
        }

        const nearest = upcoming[0]
        updateTopBarSubtitle(nearest)

        let userStatus = null
        try {
            const statusData = await apiGet(`/events/statuses?eventIds=${nearest.eventId}`)
            if (statusData.success && statusData.statuses.length > 0) {
                userStatus = { status: statusData.statuses[0].status }
            }
        } catch (err) {}

        const card = createEventCard(nearest, user.userId, userStatus)
        const temp = document.createElement('div')
        temp.innerHTML = card.render()
        const newCard = temp.firstElementChild
        nearestGameCard.replaceWith(newCard)

    } catch (error) {
        console.error('Ошибка загрузки ближайшего события:', error)
        nearestGameCard.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <div style="font-size:3rem;margin-bottom:12px;">📅</div>
                <div style="font-weight:700;font-size:1.2rem;margin-bottom:8px;">Нет ближайших событий</div>
                <div style="color:#6b7583;">Создайте первое событие</div>
            </div>`
        updateTopBarSubtitle(null)
    }
}

// Форматирует дату: «сегодня», «завтра» или «Сб, 28 мая»
function formatEventDate(dateStr) {
    const datePart = dateStr.split('T')[0]
    const eventDate = new Date(`${datePart}T00:00:00`)
    const today = new Date()
    const tomorrow = new Date()
    tomorrow.setDate(today.getDate() + 1)

    const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate())
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const tomorrowDay = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate())

    if (eventDay.getTime() === todayDay.getTime()) return 'сегодня'
    if (eventDay.getTime() === tomorrowDay.getTime()) return 'завтра'

    return eventDate.toLocaleDateString('ru-RU', {
        weekday: 'short',
        day: 'numeric',
        month: 'long'
    })
}

// Обновляет подпись под заголовком на главной
function updateTopBarSubtitle(event) {
    const subtitleEl = document.querySelector('.topBarText p')
    if (!subtitleEl) return

    if (!event) {
        subtitleEl.innerHTML = `<i class="fas fa-map-marker-alt" style="color:#c49a2c;"></i> Нет ближайших событий`
        return
    }

    const location = event.location || 'Пляж'
    const dateLabel = formatEventDate(event.date || event.eventDate)
    subtitleEl.innerHTML = `<i class="fas fa-map-marker-alt" style="color:#c49a2c;"></i> Ближайшая игра ${dateLabel} · ${location}`
}

// ============================================================
// МИНИ-КАРТОЧКА ПРОФИЛЯ
// ============================================================

async function loadProfileMiniCard(user) {
    const container = document.getElementById('profile-mini-card')
    if (!container) return

    try {
        const { user: profileData } = await apiGet(`/user/${user.userId}`)

        const initials = `${(profileData.name || '')[0]}${(profileData.surname || '')[0]}`.toUpperCase()
        const fullName = `${profileData.name || ''} ${profileData.surname || ''}`
        const role = `${profileData.position || 'Игрок'} / ${profileData.elo || 1000} elo`

        container.innerHTML = `
            <div class="card">
                <div class="cardHeader"><h3><i class="fas fa-id-card"></i> Профиль</h3></div>
                <a href="profile.html">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                        <div class="userAvatar" style="width:44px;height:44px;">${initials}</div>
                        <div class="userInfo">
                            <div class="userName">${fullName}</div>
                            <div class="userRole">${role}</div>
                        </div>
                    </div>
                </a>
                <div style="display:flex;gap:14px;margin:10px 0;">
                    <div><span class="font-bold">${profileData.elo || '—'}</span><br><small>ELO</small></div>
                    <div><span class="font-bold">${profileData.position || '—'}</span><br><small>Позиция</small></div>
                    <div><span class="font-bold">${profileData.level || '—'}</span><br><small>Уровень</small></div>
                </div>
                <a href="profile.html"><button style="width:100%;"><i class="fas fa-user-edit"></i> Редактировать профиль</button></a>
            </div>`
    } catch (error) {
        console.error('Ошибка загрузки мини-профиля:', error)
        container.innerHTML = `
            <div class="card" style="text-align:center;padding:20px;">
                <div style="color:#6b7583;">Не удалось загрузить профиль</div>
            </div>`
    }
}

initIndexPage()
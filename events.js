import { checkAuth, updateUserCard } from './auth.js'
import { apiGet } from './api.js'
import { createEventCard } from './eventCards.js'

let currentUser = null
let statusMap = {}
let allEvents = []
let activeType = 'all'
let activeLevel = 'all'
let activeFormat = 'all'

window.loadEvents = loadEvents
window.getEvent = (eventId) => allEvents.find(e => e.eventId == eventId)

// ============================================================
// ЗАГРУЗКА СОБЫТИЙ
// ============================================================

async function loadEvents() {
    const user = await checkAuth()
    if (!user) return
    currentUser = user
    window.currentUser = user

    updateUserCard(user)

    const container = document.querySelector('.mainBoard')
    if (!container) return

    const { events } = await apiGet('/events')
    allEvents = events

    // Загрузка статусов участия текущего пользователя
    if (events.length > 0) {
        try {
            const statusData = await apiGet(`/events/statuses?eventIds=${events.map(e => e.eventId).join(',')}`)
            if (statusData.success) {
                statusData.statuses.forEach(s => { statusMap[s.eventId] = s.status })
            }
        } catch (err) {
            console.error('Ошибка загрузки статусов:', err)
        }
    }

    applyFiltersAndRender()
}

// ============================================================
// ФИЛЬТРАЦИЯ И РЕНДЕР
// ============================================================

function applyFiltersAndRender() {
    const filtered = allEvents.filter(event => {
        if (activeType !== 'all' && event.eventType !== activeType) return false
        if (activeLevel !== 'all' && event.level !== activeLevel) return false
        if (activeFormat !== 'all' && event.format !== activeFormat) return false
        return true
    })

    const sorted = filtered.sort((a, b) => {
        if (a.status === 'cancelled' && b.status !== 'cancelled') return 1
        if (a.status !== 'cancelled' && b.status === 'cancelled') return -1
        return new Date(`${a.eventDate}T${a.eventTime}`) - new Date(`${b.eventDate}T${b.eventTime}`)
    })

    const container = document.querySelector('.mainBoard')
    if (sorted.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px;">
                <div style="font-size: 3rem; margin-bottom: 12px;">📅</div>
                <div style="font-weight: 700; font-size: 1.3rem; margin-bottom: 8px;">Нет запланированных событий</div>
                <div style="color: #6b7583; margin-bottom: 16px;">Создайте первое событие, чтобы начать играть</div>
                <a href="createEvent.html"><button class="buttonAccent" style="margin: 0 auto;"><i class="fas fa-plus-circle"></i> Создать событие</button></a>
            </div>`
    } else {
        container.innerHTML = sorted.map(event => {
            const userStatus = statusMap[event.eventId] ? { status: statusMap[event.eventId] } : null
            return createEventCard(event, currentUser.userId, userStatus).render()
        }).join('')
    }
}

// ============================================================
// ОБРАБОТКА ФИЛЬТРОВ
// ============================================================

document.querySelector('.filtersSection')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn || !btn.dataset.filterValue) return
    const groupName = btn.closest('.filterGroup').dataset.filterGroup

    btn.closest('.filterGroup').querySelectorAll('button').forEach(b => b.classList.remove('buttonAccent'))
    btn.classList.add('buttonAccent')

    const value = btn.dataset.filterValue
    if (groupName === 'type') activeType = value
    else if (groupName === 'level') activeLevel = value
    else if (groupName === 'format') activeFormat = value

    applyFiltersAndRender()
})

// Запуск
loadEvents()
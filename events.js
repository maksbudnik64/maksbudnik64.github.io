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
    
    // Проверяем якорь после загрузки
    checkEventAnchor()
}

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
        
        const parseDate = (e) => {
            let dp;
            if (e.eventDate && e.eventDate.includes('T')) {
                const d = new Date(e.eventDate);
                dp = d.getFullYear() + '-' + 
                     String(d.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(d.getDate()).padStart(2, '0');
            } else {
                dp = e.eventDate;
            }
            return new Date(dp + 'T' + (e.eventTime || '00:00'));
        };
        return parseDate(a) - parseDate(b);
    })

    const container = document.querySelector('.mainBoard')
    if (sorted.length === 0) {
        container.innerHTML = window.renderEmptyEventsCard();
    } else {
        container.innerHTML = sorted.map(event => {
            const userStatus = statusMap[event.eventId] ? { status: statusMap[event.eventId] } : null
            return createEventCard(event, currentUser.userId, userStatus).render()
        }).join('')
    }
}

// Обработчик фильтров
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

// ============================================================
// ОБРАБОТКА ЯКОРЯ ПРИ ЗАГРУЗКЕ
// ============================================================

function checkEventAnchor() {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('eventId');
    if (eventId && window.highlightEventCard) {
        // Небольшая задержка для рендера карточек
        setTimeout(() => {
            window.highlightEventCard(parseInt(eventId));
        }, 300);
    }
}

loadEvents()
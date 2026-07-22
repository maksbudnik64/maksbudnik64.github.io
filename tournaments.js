import { checkAuth, updateUserCard } from './auth.js'
import { apiGet } from './api.js'
import { createEventCard } from './eventCards.js'

let currentUser = null
let allTournaments = []
let activeStatusFilter = 'all'

window.loadTournaments = loadTournaments
window.getEvent = (eventId) => allTournaments.find(e => e.eventId == eventId)

// ============================================================
// ЗАГРУЗКА ТУРНИРОВ
// ============================================================

async function loadTournaments() {
    const user = await checkAuth()
    if (!user) return
    currentUser = user
    window.currentUser = user

    updateUserCard(user)

    const { events } = await apiGet('/events?type=tournament')
    allTournaments = events
    applyFiltersAndRender()
}

// ============================================================
// ФИЛЬТРАЦИЯ И РЕНДЕР
// ============================================================

async function applyFiltersAndRender() {
    const filtered = allTournaments.filter(t => {
        if (activeStatusFilter === 'active' && t.status !== 'confirmed') return false
        if (activeStatusFilter === 'registration' && t.status !== 'pending') return false
        if (activeStatusFilter === 'finished' && t.status !== 'finished') return false
        if (activeStatusFilter === 'my' && t.creatorId !== currentUser.userId) return false
        return true
    })

    const sorted = filtered.sort((a, b) => {
        if (a.status === 'confirmed' && b.status !== 'confirmed') return -1
        if (a.status !== 'confirmed' && b.status === 'confirmed') return 1
        if (a.status === 'pending' && b.status !== 'pending') return -1
        if (a.status !== 'pending' && b.status === 'pending') return 1
        return new Date(`${a.eventDate}T${a.eventTime}`) - new Date(`${b.eventDate}T${b.eventTime}`)
    })

    let statusMap = {}
    if (sorted.length > 0) {
        try {
            const statusData = await apiGet(`/events/statuses?eventIds=${sorted.map(t => t.eventId).join(',')}`)
            if (statusData.success) {
                statusData.statuses.forEach(s => { statusMap[s.eventId] = s.status })
            }
        } catch (err) {
            console.error('Ошибка загрузки статусов:', err)
        }
    }

    const container = document.getElementById('tournaments-container')
    if (sorted.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px;">
                <div style="font-size: 3rem; margin-bottom: 12px;">🏆</div>
                <div style="font-weight: 700; font-size: 1.3rem; margin-bottom: 8px;">Нет запланированных турниров</div>
                <div style="color: #6b7583; margin-bottom: 16px;">Создайте первый турнир, чтобы собрать игроков</div>
                <a href="createEvent.html?type=tournament"><button class="buttonAccent" style="margin: 0 auto;"><i class="fas fa-plus-circle"></i> Создать турнир</button></a>
            </div>`
    } else {
        container.innerHTML = sorted.map(tournament => {
            const userStatus = statusMap[tournament.eventId] ? { status: statusMap[tournament.eventId] } : null
            return createEventCard(tournament, currentUser.userId, userStatus).render()
        }).join('')
    }
}

// ============================================================
// ОБРАБОТКА ФИЛЬТРОВ
// ============================================================

document.querySelector('.filtersSection')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn || !btn.dataset.filterValue) return
    btn.closest('.filterGroup').querySelectorAll('button').forEach(b => b.classList.remove('buttonAccent'))
    btn.classList.add('buttonAccent')
    activeStatusFilter = btn.dataset.filterValue
    applyFiltersAndRender()
})

// Закрытие модальных окон
document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => b.closest('.modal').style.display = 'none'))
window.addEventListener('click', e => { if (e.target.classList.contains('modal')) e.target.style.display = 'none' })

loadTournaments()
import { checkAuth, updateUserCard } from './auth.js'
import { apiGet } from './api.js'
import { createEventCard } from './eventCards.js'

let currentUser = null
let statusMap = {}
let allTournaments = []
let activeFilter = 'all'

window.loadTournaments = loadTournaments
window.getEvent = (eventId) => allTournaments.find(e => e.eventId == eventId) || null

async function loadTournaments() {
    const user = await checkAuth()
    if (!user) return
    currentUser = user
    window.currentUser = user

    updateUserCard(user)

    const container = document.getElementById('tournaments-container')
    if (!container) return

    try {
        const { events } = await apiGet('/events?type=tournament')
        allTournaments = events

        if (events.length > 0) {
            try {
                const statusData = await apiGet(`/events/statuses?eventIds=${events.map(e => e.eventId).join(',')}`)
                if (statusData.success) {
                    statusData.statuses.forEach(s => { statusMap[s.eventId] = s.status })
                }
            } catch (err) {}
        }

        applyFiltersAndRender()
    } catch (error) {
        console.error('Ошибка загрузки турниров:', error)
        container.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <div style="font-size:3rem;margin-bottom:12px;">😔</div>
                <div style="font-weight:700;font-size:1.2rem;margin-bottom:8px;">Ошибка загрузки</div>
                <div style="color:#6b7583;">Попробуйте обновить страницу</div>
            </div>`
    }
}

function applyFiltersAndRender() {
    const container = document.getElementById('tournaments-container')
    if (!container) return

    let filtered = [...allTournaments]

    switch (activeFilter) {
        case 'active':
            // Активные: groupStage или playoff
            filtered = filtered.filter(t => 
                t.tournamentStatus === 'groupStage' || t.tournamentStatus === 'playoff'
            )
            break
        case 'registration':
            // Набираются: статус pending и турнир в стадии registration
            filtered = filtered.filter(t => 
                t.status === 'pending' && t.tournamentStatus === 'registration'
            )
            break
        case 'finished':
            // Завершённые: отменённые или tournamentStatus = 'finished'
            filtered = filtered.filter(t => 
                t.status === 'cancelled' || t.tournamentStatus === 'finished'
            )
            break
        case 'my':
            // Мои: созданные пользователем или где он участник
            filtered = filtered.filter(t => {
                const userStatus = statusMap[t.eventId]
                return t.creatorId === currentUser?.userId || 
                       (userStatus && (userStatus === 'confirmed' || userStatus === 'application'))
            })
            break
    }

    // Сортировка
    filtered.sort((a, b) => {
        if (a.status === 'cancelled' && b.status !== 'cancelled') return 1
        if (a.status !== 'cancelled' && b.status === 'cancelled') return -1
        
        const parseDate = (e) => {
            let dp
            if (e.eventDate && e.eventDate.includes('T')) {
                const d = new Date(e.eventDate)
                dp = d.getFullYear() + '-' + 
                     String(d.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(d.getDate()).padStart(2, '0')
            } else {
                dp = e.eventDate
            }
            return new Date(dp + 'T' + (e.eventTime || '00:00'))
        }
        return parseDate(a) - parseDate(b)
    })

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <div style="font-size:3rem;margin-bottom:12px;">🏆</div>
                <div style="font-weight:700;font-size:1.2rem;margin-bottom:8px;">Нет турниров</div>
                <div style="color:#6b7583;margin-bottom:16px;">Создайте первый турнир</div>
                <a href="createEvent.html?type=tournament" style="display:inline-block;">
                    <button class="buttonAccent">
                        <i class="fas fa-plus-circle"></i> Создать турнир
                    </button>
                </a>
            </div>`
        return
    }

    container.innerHTML = filtered.map(event => {
        const userStatus = statusMap[event.eventId] ? { status: statusMap[event.eventId] } : null
        return createEventCard(event, currentUser.userId, userStatus).render()
    }).join('')
}

// Обработчик фильтров
document.querySelector('.filtersSection')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn || !btn.dataset.filterValue) return

    btn.closest('.filterGroup').querySelectorAll('button').forEach(b => b.classList.remove('buttonAccent'))
    btn.classList.add('buttonAccent')

    activeFilter = btn.dataset.filterValue
    applyFiltersAndRender()
})

loadTournaments()
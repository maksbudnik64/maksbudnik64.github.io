import { apiGet, apiPut, apiPost } from './api.js'

// ============================================================
// ОБНОВЛЕНИЕ КАРТОЧКИ СОБЫТИЯ
// ============================================================

async function refreshEventCard(eventId, newStatus) {
    try {
        const data = await apiGet(`/events/${eventId}`)
        const event = data.event
        const currentUserId = window.currentUser?.userId

        let userStatus = null
        if (event.creatorId !== currentUserId) {
            const statusData = await apiGet(`/events/statuses?eventIds=${eventId}`)
            if (statusData.success && statusData.statuses.length > 0) {
                userStatus = { status: statusData.statuses[0].status }
            }
        }

        const card = window.createEventCard(event, currentUserId, userStatus)
        const oldCard = document.querySelector(`.card[data-event-id="${eventId}"]`)
        if (oldCard) oldCard.outerHTML = card.render()
    } catch (err) {
        console.error('Ошибка обновления карточки:', err)
    }
}
window.refreshEventCard = refreshEventCard

// ============================================================
// УПРАВЛЕНИЕ УЧАСТНИКАМИ
// ============================================================

async function loadManageParticipants(eventId) {
    const container = document.getElementById('participants-manage-list')
    if (!container) return
    container.innerHTML = '<p>Загрузка...</p>'

    const event = window.getEvent ? window.getEvent(eventId) : null
    const isTournament = event && event.eventType === 'tournament'

    if (isTournament) {
        await loadTournamentParticipants(eventId, container)
    } else {
        await loadEventParticipants(eventId, container, event)
    }
}
window.loadManageParticipants = loadManageParticipants

async function loadTournamentParticipants(eventId, container) {
    try {
        const data = await apiGet(`/events/${eventId}/teams`)
        if (!data.success || data.teams.length === 0) {
            container.innerHTML = '<p>Нет команд</p>'
            return
        }

        container.innerHTML = data.teams.map(team => {
            const teamName = team.players.map(p => p.surname).join(' · ') || `Команда #${team.teamId}`
            const status = team.status
            const isApplication = status === 'application'
            const isBlocked = status === 'blocked'
            const isConfirmed = status === 'confirmed'

            const statusIcon = {
                application: '<i class="fas fa-clock" style="color:#f5b042; margin-right:8px;"></i>',
                confirmed: '<i class="fas fa-check-circle" style="color:#10b981; margin-right:8px;"></i>',
                declined: '<i class="fas fa-times-circle" style="color:#c0392b; margin-right:8px;"></i>',
                blocked: '<i class="fas fa-ban" style="color:#c0392b; margin-right:8px;"></i>'
            }[status] || '<i class="fas fa-circle" style="color:#aaa; margin-right:8px;"></i>'

            let actionBtn = ''
            if (isApplication) {
                actionBtn = `<button class="accept-team-btn buttonAccent" data-event-id="${eventId}" data-team-id="${team.teamId}">Принять</button>
                             <button class="decline-team-btn" data-event-id="${eventId}" data-team-id="${team.teamId}">Отклонить</button>`
            } else if (isBlocked) {
                actionBtn = `<button class="unblock-team-btn buttonAccent" data-event-id="${eventId}" data-team-id="${team.teamId}">Разблокировать</button>`
            } else if (isConfirmed) {
                actionBtn = `<button class="block-team-btn" data-event-id="${eventId}" data-team-id="${team.teamId}">Заблокировать</button>`
            }

            return `
                <div class="team-row" style="border: 1px solid #efe8d8; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; font-weight: 700; margin-bottom: 8px;">${statusIcon} ${teamName}</div>
                    <div style="margin-bottom: 8px; font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 4px;">
                        ${team.players.map(p => `<a href="profile.html?id=${p.userId}" target="_blank" style="display: inline-block; padding: 4px 8px; margin: 2px; color: inherit; text-decoration: none; background: #fbf9f5; border-radius: 6px;">${p.name} ${p.surname}</a>`).join('')}
                    </div>
                    <div class="statusButtons" style="margin:0;">${actionBtn}</div>
                </div>`
        }).join('')
    } catch (err) {
        container.innerHTML = '<p>Ошибка загрузки команд</p>'
    }
}

async function loadEventParticipants(eventId, container, event) {
    try {
        const data = await apiGet(`/events/${eventId}/all-participants`)
        if (!data.success) {
            container.innerHTML = '<p>Ошибка загрузки</p>'
            return
        }

        const participants = data.participants
        if (participants.length === 0) {
            container.innerHTML = '<p>Нет участников</p>'
        } else {
            container.innerHTML = participants.map(p => {
                const icons = {
                    confirmed: ['fa-check-circle', '#10b981'],
                    maybe: ['fa-question-circle', '#f5b042'],
                    declined: ['fa-times-circle', '#c0392b'],
                    waitlist: ['fa-clipboard-list', '#8e9aab'],
                    blocked: ['fa-ban', '#c0392b']
                }
                const [icon, color] = icons[p.status] || ['fa-circle', '#aaa']
                const isBlocked = p.status === 'blocked'
                return `
                    <div class="participant-row" style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid #efe8d8;">
                        <span><i class="fas ${icon}" style="color:${color}; margin-right:8px;"></i>${p.name} ${p.surname}</span>
                        <div class="statusButtons" style="margin:0;">
                            <button class="block-participant-btn ${isBlocked ? '' : 'buttonAccent'}" data-event-id="${eventId}" data-user-id="${p.userId}" data-blocked="${isBlocked}">
                                <i class="fas ${isBlocked ? 'fa-unlock' : 'fa-ban'}"></i> ${isBlocked ? 'Разблокировать' : 'Заблокировать'}
                            </button>
                        </div>
                    </div>`
            }).join('')
        }
    } catch (err) {
        container.innerHTML = '<p>Ошибка сети</p>'
    }

    // Загрузка заявок для событий с доступом по заявкам
    if (event && event.accessType === 'application') {
        try {
            const appData = await apiGet(`/events/${eventId}/applications`)
            if (appData.success && appData.applications.length > 0) {
                let appHtml = '<h4 style="margin-top:16px;">Заявки</h4>'
                appData.applications.forEach(app => {
                    appHtml += `
                        <div class="participant-row" style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid #efe8d8;">
                            <span>${app.name} ${app.surname}</span>
                            <div class="statusButtons" style="margin:0;">
                                <button class="accept-application-btn buttonAccent" data-event-id="${eventId}" data-user-id="${app.userId}">Принять</button>
                                <button class="decline-application-btn" data-event-id="${eventId}" data-user-id="${app.userId}">Отклонить</button>
                            </div>
                        </div>`
                })
                container.innerHTML += appHtml
            }
        } catch (err) {
            console.error('Ошибка загрузки заявок:', err)
        }
    }
}

// ============================================================
// ЗАГРУЗКА СПИСКА УЧАСТНИКОВ В ВЫПАДАЮЩИЙ СПИСОК
// ============================================================

async function loadParticipantsList(eventId, listElement) {
    const event = window.getEvent ? window.getEvent(eventId) : null
    const isTournament = event && event.eventType === 'tournament'

    if (isTournament) {
        await loadTournamentParticipantsList(eventId, listElement)
    } else {
        await loadEventParticipantsList(eventId, listElement)
    }
    listElement.dataset.loaded = 'true'
}

async function loadTournamentParticipantsList(eventId, listElement) {
    try {
        const data = await apiGet(`/events/${eventId}/teams`)
        if (data.success && data.teams.length > 0) {
            listElement.innerHTML = data.teams.map(team => {
                const teamName = team.players.map(p => p.surname).join(' · ') || `Команда #${team.teamId}`
                const status = team.status
                let teamIcon = '', teamColor = ''
                switch (status) {
                    case 'application': teamIcon = 'fa-clock'; teamColor = '#f5b042'; break
                    case 'confirmed': teamIcon = 'fa-check-circle'; teamColor = '#10b981'; break
                    case 'declined': teamIcon = 'fa-times-circle'; teamColor = '#c0392b'; break
                    case 'blocked': teamIcon = 'fa-ban'; teamColor = '#c0392b'; break
                    default: teamIcon = 'fa-circle'; teamColor = '#aaa'
                }

                const playersHtml = team.players.map(p => {
                    let icon = ''
                    switch (p.status) {
                        case 'confirmed': icon = '<i class="fas fa-check-circle" style="color:#10b981;"></i>'; break
                        case 'application': icon = '<i class="fas fa-clock" style="color:#f5b042;"></i>'; break
                        case 'declined': icon = '<i class="fas fa-times-circle" style="color:#c0392b;"></i>'; break
                        case 'blocked': icon = '<i class="fas fa-ban" style="color:#c0392b;"></i>'; break
                        default: icon = '<i class="fas fa-circle" style="color:#aaa;"></i>'
                    }
                    return `
                        <li style="padding: 4px 16px 4px 24px; font-size: 0.85rem;">
                            <a href="profile.html?id=${p.userId}" target="_blank" style="color: inherit; text-decoration: none; display: flex; align-items: center; gap: 6px;">
                                ${icon} ${p.name} ${p.surname}
                            </a>
                        </li>`
                }).join('')

                return `
                    <li style="padding: 0;">
                        <div class="team-toggle" style="padding: 8px 16px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px; background: #fbf9f5; border-bottom: 1px solid #efe4cf;">
                            <i class="fas fa-chevron-right" style="font-size: 0.7rem; transition: transform 0.2s;"></i>
                            <i class="fas ${teamIcon}" style="color: ${teamColor};"></i>
                            ${teamName}
                        </div>
                        <ul style="display: none; list-style: none; margin: 0; padding: 0;">${playersHtml}</ul>
                    </li>`
            }).join('')
        } else {
            listElement.innerHTML = '<li style="padding: 6px 16px; color: #999;">Нет команд</li>'
        }
    } catch (err) {
        listElement.innerHTML = '<li style="padding: 6px 16px; color: #999;">Ошибка загрузки</li>'
    }
}

async function loadEventParticipantsList(eventId, listElement) {
    try {
        const data = await apiGet(`/events/${eventId}/all-participants`)
        if (data.success && data.participants.length > 0) {
            listElement.innerHTML = data.participants.map(p => {
                let icon = ''
                switch (p.status) {
                    case 'confirmed': icon = '<i class="fas fa-check-circle" style="color:#10b981;"></i>'; break
                    case 'maybe':    icon = '<i class="fas fa-question-circle" style="color:#f5b042;"></i>'; break
                    case 'declined': icon = '<i class="fas fa-times-circle" style="color:#c0392b;"></i>'; break
                    case 'waitlist': icon = '<i class="fas fa-clipboard-list" style="color:#8e9aab;"></i>'; break
                    case 'blocked':  icon = '<i class="fas fa-ban" style="color:#c0392b;"></i>'; break
                }
                return `<li style="padding: 6px 16px; font-size: 0.9rem;">
                            <a href="profile.html?id=${p.userId}" target="_blank" style="color: inherit; text-decoration: none; display: flex; align-items: center; gap: 6px;">
                                ${icon} ${p.name} ${p.surname}
                            </a>
                        </li>`
            }).join('')
        } else {
            listElement.innerHTML = '<li style="padding: 6px 16px; color: #999;">Нет участников</li>'
        }
    } catch (err) {
        listElement.innerHTML = '<li style="padding: 6px 16px; color: #999;">Ошибка загрузки</li>'
    }
}

// ============================================================
// УЧАСТИЕ В СОБЫТИИ
// ============================================================

async function updateParticipation(eventId, status) {
    try {
        const data = await apiPost(`/events/${eventId}/participate`, { status })
        refreshEventCard(eventId)
        const list = document.querySelector(`.participants-modal ul[data-event-id="${eventId}"]`)
        if (list) {
            list.innerHTML = ''
            list.removeAttribute('data-loaded')
            list.closest('.participants-modal').style.display = 'none'
        }
        return true
    } catch (error) {
        alert(error.message || 'Не удалось подключиться к серверу')
        return false
    }
}

async function updateTeamStatus(eventId, teamId, status) {
    try {
        await apiPut(`/events/${eventId}/team/${teamId}/status`, { status })
    } catch (err) {
        alert(err.message || 'Ошибка')
    }
}

// ============================================================
// МОДАЛЬНОЕ ОКНО ЗАПИСИ КОМАНДЫ
// ============================================================

async function openTeamRegistrationModal(eventId, format) {
    document.getElementById('team-event-id').value = eventId
    const container = document.getElementById('team-players-container')

    const playersCount = format === '2×2' ? 2 : format === '3×3' ? 3 : 4
    const partnersNeeded = playersCount - 1

    container.innerHTML = ''

    for (let i = 1; i <= partnersNeeded; i++) {
        const label = i === 1 ? 'Партнёр' : i === 2 ? 'Второй партнёр' : 'Третий партнёр'
        const div = document.createElement('div')
        div.className = 'authFormGroup'
        div.style.position = 'relative'
        div.innerHTML = `
            <label>${label}</label>
            <input type="text" class="partner-search" data-partner="${i}" placeholder="Введите минимум два символа для поиска" autocomplete="off" />
            <input type="hidden" name="partner${i}" class="partner-id" />
            <div class="autocomplete-list" style="display:none; position:absolute; top:100%; left:0; right:0; background:white; border:1px solid #e2d9cc; border-radius:8px; z-index:60; max-height:150px; overflow-y:auto;"></div>
        `
        container.appendChild(div)
    }

    container.querySelectorAll('.partner-search').forEach(input => {
        const handler = debounce(async (e) => {
            const query = e.target.value.trim()
            const list = e.target.parentElement.querySelector('.autocomplete-list')
            if (query.length < 2) {
                list.style.display = 'none'
                return
            }
            try {
                const res = await fetch(`http://localhost:5000/api/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include' })
                if (!res.ok) {
                    list.innerHTML = '<div style="padding:6px 12px; color:#999;">Ошибка сервера</div>'
                    list.style.display = 'block'
                    return
                }
                const data = await res.json()
                if (data.success && Array.isArray(data.users)) {
                    if (data.users.length > 0) {
                        list.innerHTML = data.users.map(u => `<div class="autocomplete-item" data-user-id="${u.userId}">${u.name} ${u.surname}</div>`).join('')
                    } else {
                        list.innerHTML = '<div style="padding:6px 12px; color:#999;">Ничего не найдено</div>'
                    }
                }
                list.style.display = 'block'
            } catch (err) {
                list.innerHTML = '<div style="padding:6px 12px; color:#999;">Ошибка сети</div>'
                list.style.display = 'block'
            }
        }, 300)

        input.addEventListener('input', handler)

        input.parentElement.querySelector('.autocomplete-list').addEventListener('click', (e) => {
            const item = e.target.closest('.autocomplete-item')
            if (!item) return
            const userId = item.dataset.userId
            const name = item.textContent
            input.value = name
            input.parentElement.querySelector('.partner-id').value = userId
            input.parentElement.querySelector('.autocomplete-list').style.display = 'none'
        })
    })

    document.getElementById('team-registration-modal').style.display = 'block'
}

// Отправка формы записи команды
document.getElementById('team-registration-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const eventId = document.getElementById('team-event-id').value
    const messageEl = document.querySelector('#team-registration-modal .authMessage')

    const partners = []
    for (let i = 1; i <= 3; i++) {
        const input = document.querySelector(`input[name="partner${i}"]`)
        if (input && input.value) {
            partners.push(Number(input.value))
        }
    }

    if (partners.length === 0) {
        if (messageEl) {
            messageEl.textContent = 'Выберите хотя бы одного партнёра'
            messageEl.className = 'authMessage error'
            messageEl.style.display = 'block'
            setTimeout(() => { messageEl.className = 'authMessage'; messageEl.style.display = 'none' }, 5000)
        }
        return
    }

    // Проверка соответствия полу турнира
    try {
        const eventData = await apiGet(`/events/${eventId}`)
        const tournamentGender = eventData.event?.tournamentGender

        if (tournamentGender) {
            const currentUserData = await apiGet('/me')
            const currentUserId = currentUserData.user?.userId
            const allMemberIds = [currentUserId, ...partners]

            const users = []
            for (const uid of allMemberIds) {
                const userData = await apiGet(`/user/${uid}`)
                users.push(userData.user)
            }

            const males = users.filter(u => u.gender === 'male').length
            const females = users.filter(u => u.gender === 'female').length

            if (tournamentGender === 'Мужской' && females > 0) {
                showTeamMessage(messageEl, 'В мужском турнире могут участвовать только мужчины')
                return
            }
            if (tournamentGender === 'Женский' && males > 0) {
                showTeamMessage(messageEl, 'В женском турнире могут участвовать только женщины')
                return
            }
            if (tournamentGender === 'Миксты') {
                if (males < 1) { showTeamMessage(messageEl, 'В миксте должен быть минимум один мужчина'); return }
                if (females < 1) { showTeamMessage(messageEl, 'В миксте должна быть минимум одна женщина'); return }
            }
        }
    } catch (err) {
        console.error('Ошибка проверки пола:', err)
    }

    try {
        const res = await fetch(`http://localhost:5000/api/events/${eventId}/team`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ partners })
        })
        const data = await res.json()
        if (data.success) {
            document.getElementById('team-registration-modal').style.display = 'none'
            refreshEventCard(eventId)
        } else {
            showTeamMessage(messageEl, data.message || 'Ошибка')
        }
    } catch (err) {
        showTeamMessage(messageEl, 'Ошибка сети')
    }
})

function showTeamMessage(el, text) {
    if (!el) return
    el.textContent = text
    el.className = 'authMessage error'
    el.style.display = 'block'
    setTimeout(() => { el.className = 'authMessage'; el.style.display = 'none' }, 5000)
}

function debounce(fn, delay) {
    let timer
    return function(...args) {
        clearTimeout(timer)
        timer = setTimeout(() => fn.apply(this, args), delay)
    }
}

// ============================================================
// ДЕЛЕГИРОВАНИЕ КЛИКОВ
// ============================================================

document.addEventListener('click', async (e) => {
    // Кнопки статусов участия
    if (e.target.hasAttribute('data-js-switch-button')) {
        const btn = e.target
        if (!btn.classList.contains('buttonAccent')) {
            const ok = await updateParticipation(btn.dataset.eventId, btn.dataset.status)
            if (ok) {
                Array.from(btn.parentElement.children).forEach(b => b.classList.remove('buttonAccent'))
                btn.classList.add('buttonAccent')
            }
        }
    }
    // Кнопка резерва
    else if (e.target.hasAttribute('data-js-reserve-button')) {
        const btn = e.target
        const isActive = btn.classList.contains('buttonAccent')
        const ok = await updateParticipation(btn.dataset.eventId, isActive ? 'none' : 'waitlist')
        if (ok) {
            btn.classList.toggle('buttonAccent')
            btn.textContent = isActive ? 'В резерв' : 'В резерве'
        }
    }
    // Редактирование события
    else if (e.target.closest('.edit-event-btn')) {
        const btn = e.target.closest('.edit-event-btn')
        const data = await apiGet(`/events/${btn.dataset.eventId}`)
        const ev = data.event
        document.getElementById('edit-event-id').value = ev.eventId
        document.getElementById('edit-title').textContent = ev.title
        document.getElementById('edit-status').value = ev.status
        document.getElementById('edit-date').value = ev.eventDate.slice(0, 10)
        document.getElementById('edit-time').value = ev.eventTime.slice(0, 5)
        document.getElementById('edit-duration').value = ev.duration
        document.getElementById('edit-format').value = ev.format
        document.getElementById('edit-level').value = ev.level
        document.getElementById('edit-maxPlayers').value = ev.maxPlayers
        document.getElementById('edit-location').value = ev.location
        document.getElementById('edit-description').value = ev.description || ''
        if (ev.eventType === 'tournament') {
            document.getElementById('edit-tournament-fields').style.display = 'block'
            document.getElementById('edit-tournamentGender').value = ev.tournamentGender || 'Мужской'
            document.getElementById('edit-tournamentFormat').value = ev.tournamentFormat || ''
        } else {
            document.getElementById('edit-tournament-fields').style.display = 'none'
        }
        document.getElementById('edit-event-modal').style.display = 'block'
    }
    // Управление участниками
    else if (e.target.closest('.manage-participants-btn')) {
        const btn = e.target.closest('.manage-participants-btn')
        loadManageParticipants(btn.dataset.eventId)
        document.getElementById('manage-participants-modal').style.display = 'block'
    }
    // Раскрытие списка участников
    else if (e.target.closest('.toggle-participants')) {
        e.stopPropagation()
        const btn = e.target.closest('.toggle-participants')
        const eventId = btn.dataset.eventId
        const modal = btn.nextElementSibling
        const list = modal.querySelector('ul')

        document.querySelectorAll('.participants-modal').forEach(m => {
            if (m !== modal) m.style.display = 'none'
        })

        if (list.dataset.loaded !== 'true') {
            await loadParticipantsList(eventId, list)
        }

        const isVisible = modal.style.display === 'block'
        modal.style.display = isVisible ? 'none' : 'block'

        if (list.dataset.loaded === 'true') {
            list.querySelectorAll('.team-toggle').forEach(toggle => {
                toggle.onclick = function(e) {
                    e.stopPropagation()
                    const sublist = this.nextElementSibling
                    const icon = this.querySelector('.fa-chevron-right')
                    const isOpen = sublist.style.display === 'block'
                    sublist.style.display = isOpen ? 'none' : 'block'
                    icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)'
                }
            })
        }
    }
    // Подача заявки
    else if (e.target.closest('.apply-btn')) {
        const btn = e.target.closest('.apply-btn')
        const ok = await updateParticipation(btn.dataset.eventId, 'application')
        if (ok) { btn.classList.remove('buttonAccent'); btn.innerHTML = '<i class="fas fa-clock"></i> Заявка подана'; btn.disabled = true }
    }
    // Старт турнира
    else if (e.target.closest('.start-tournament-btn')) {
        window.location.href = `startTournament.html?id=${e.target.closest('.start-tournament-btn').dataset.eventId}`
    }
    // Отмена записи
    else if (e.target.closest('.cancel-registration-btn')) {
        const btn = e.target.closest('.cancel-registration-btn')
        await updateParticipation(btn.dataset.eventId, 'none')
    }
    // Запись команды
    else if (e.target.closest('.register-team-btn')) {
        const btn = e.target.closest('.register-team-btn')
        const eventId = btn.dataset.eventId
        const format = btn.dataset.format
        openTeamRegistrationModal(eventId, format)
    }
})

// ============================================================
// ФОРМА РЕДАКТИРОВАНИЯ СОБЫТИЯ
// ============================================================

document.getElementById('edit-event-form')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const eventId = document.getElementById('edit-event-id').value
    const formData = new FormData(e.target)
    try {
        await apiPut(`/events/${eventId}`, Object.fromEntries(formData))
        document.getElementById('edit-event-modal').style.display = 'none'
        refreshEventCard(eventId)
    } catch (err) {
        alert(err.message || 'Ошибка сохранения')
    }
})

// ============================================================
// ПРИНЯТИЕ / ОТКЛОНЕНИЕ ЗАЯВОК
// ============================================================

document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.accept-application-btn, .decline-application-btn')
    if (!btn) return
    const { eventId, userId } = btn.dataset
    const isAccept = btn.classList.contains('accept-application-btn')
    const newStatus = isAccept ? 'confirmed' : 'declined'
    try {
        await apiPut(`/events/${eventId}/application/${userId}`, { status: newStatus })
        loadManageParticipants(eventId)
        refreshEventCard(eventId)
    } catch (err) {
        console.error(err)
    }
})

// ============================================================
// УПРАВЛЕНИЕ КОМАНДАМИ
// ============================================================

document.addEventListener('click', async (e) => {
    const acceptBtn = e.target.closest('.accept-team-btn')
    const declineBtn = e.target.closest('.decline-team-btn')
    const blockBtn = e.target.closest('.block-team-btn')
    const unblockBtn = e.target.closest('.unblock-team-btn')

    if (acceptBtn) {
        await updateTeamStatus(acceptBtn.dataset.eventId, acceptBtn.dataset.teamId, 'confirmed')
        loadManageParticipants(acceptBtn.dataset.eventId)
        refreshEventCard(acceptBtn.dataset.eventId)
    }
    if (declineBtn) {
        await updateTeamStatus(declineBtn.dataset.eventId, declineBtn.dataset.teamId, 'declined')
        loadManageParticipants(declineBtn.dataset.eventId)
        refreshEventCard(declineBtn.dataset.eventId)
    }
    if (blockBtn) {
        await updateTeamStatus(blockBtn.dataset.eventId, blockBtn.dataset.teamId, 'blocked')
        loadManageParticipants(blockBtn.dataset.eventId)
        refreshEventCard(blockBtn.dataset.eventId)
    }
    if (unblockBtn) {
        const event = window.getEvent ? window.getEvent(unblockBtn.dataset.eventId) : null
        const newStatus = event && event.accessType === 'application' ? 'application' : 'confirmed'
        await updateTeamStatus(unblockBtn.dataset.eventId, unblockBtn.dataset.teamId, newStatus)
        loadManageParticipants(unblockBtn.dataset.eventId)
        refreshEventCard(unblockBtn.dataset.eventId)
    }
})

// ============================================================
// БЛОКИРОВКА УЧАСТНИКОВ
// ============================================================

document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.block-participant-btn')
    if (!btn || !btn.closest('#manage-participants-modal')) return

    const { eventId, userId, blocked } = btn.dataset
    const newStatus = blocked === 'true' ? 'declined' : 'blocked'
    try {
        await apiPost(`/events/${eventId}/participate`, { userId: Number(userId), status: newStatus })
        loadManageParticipants(eventId)
        refreshEventCard(eventId)
    } catch (err) {
        alert(err.message || 'Ошибка')
    }
})

// ============================================================
// ЗАКРЫТИЕ МОДАЛЬНЫХ ОКОН И ВЫПАДАЮЩИХ СПИСКОВ
// ============================================================

document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => b.closest('.modal').style.display = 'none'))
window.addEventListener('mousedown', e => { if (e.target.classList.contains('modal')) e.target.style.display = 'none' })

document.addEventListener('click', function(e) {
    if (!e.target.closest('.participants-modal') && !e.target.closest('.toggle-participants')) {
        document.querySelectorAll('.participants-modal').forEach(m => m.style.display = 'none')
    }
})
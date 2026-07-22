import { checkAuth, updateUserCard } from './auth.js'
import { apiGet, apiPut } from './api.js'
import { BracketRenderer } from './bracketRenderer.js'
import { getTeamNameFromTeam, getGroupLetter } from './utils.js'

let currentUser = null
let tournament = null
let teams = []
let interactiveBracket = null

// ============================================================
// ЗАГРУЗКА ТУРНИРА
// ============================================================

async function loadTournament() {
    const user = await checkAuth()
    if (!user) {
        window.location.href = 'login.html'
        return
    }
    currentUser = user

    updateUserCard(user)

    const params = new URLSearchParams(window.location.search)
    const eventId = params.get('id')
    if (!eventId) {
        alert('Турнир не указан')
        return
    }

    document.getElementById('event-id').value = eventId

    const eventData = await apiGet(`/events/${eventId}`)
    tournament = eventData.event

    const status = tournament.tournamentStatus
    if (status === 'groupStage' || status === 'playoff') {
        alert('Этот турнир уже запущен!')
        window.location.href = `activeTournament.html?id=${eventId}`
        return
    }
    if (status === 'finished') {
        alert('Этот турнир уже завершён!')
        window.location.href = 'tournaments.html'
        return
    }

    document.getElementById('tournament-title').textContent = tournament.title
    document.getElementById('tournament-format').value = tournament.tournamentFormat || 'Групповой этап + плей-офф'
    document.getElementById('format-display').textContent = tournament.tournamentFormat || 'Групповой этап + плей-офф'

    const teamsData = await apiGet(`/events/${eventId}/teams`)
    teams = teamsData.teams
    renderGroupOptions()
    renderManualPlacement()

    document.getElementById('group-count').addEventListener('change', onGroupCountChange)
    document.getElementById('advance-count').addEventListener('change', onAdvanceCountChange)
    document.getElementById('shuffle-btn').addEventListener('click', shuffleTeams)
}

// ============================================================
// НАСТРОЙКИ ГРУПП
// ============================================================

function renderGroupOptions() {
    const select = document.getElementById('group-count')
    const params = document.getElementById('group-params')
    const format = document.getElementById('tournament-format').value

    if (format === 'Король корта (каждый с каждым)' || format === 'Олимпийская система (на вылет)') {
        params.style.display = 'none'
        return
    }

    params.style.display = 'block'
    select.innerHTML = ''

    const possible = []
    for (let g = 2; g <= 3; g++) {
        if (teams.length >= g * 2) possible.push(g)
    }

    possible.forEach(g => {
        const opt = document.createElement('option')
        opt.value = g
        opt.textContent = `${g} группы`
        select.appendChild(opt)
    })

    select.value = possible[0] || 2
    updateAdvanceOptions()
}

function updateAdvanceOptions() {
    const groupCount = parseInt(document.getElementById('group-count').value) || 2
    const minTeams = Math.floor(teams.length / groupCount)
    const select = document.getElementById('advance-count')
    select.innerHTML = ''

    for (let a = 1; a <= minTeams; a++) {
        const opt = document.createElement('option')
        opt.value = a
        opt.textContent = `${a} команд${a > 1 ? 'ы' : 'а'}`
        select.appendChild(opt)
    }
}

function onGroupCountChange() {
    updateAdvanceOptions()
    renderManualPlacement()
    validateForm()
}

function onAdvanceCountChange() {
    validateForm()
}

// ============================================================
// РУЧНАЯ РАССТАНОВКА
// ============================================================

function renderManualPlacement() {
    const container = document.getElementById('groups-container')
    const format = document.getElementById('tournament-format').value
    const shuffleContainer = document.getElementById('shuffle-container')

    if (format === 'Олимпийская система (на вылет)') {
        if (shuffleContainer) shuffleContainer.style.display = 'block'
        container.innerHTML = ''

        if (interactiveBracket) interactiveBracket.destroy()

        const teamNames = {}
        teams.forEach(t => { teamNames[t.teamId] = getTeamNameFromTeam(t) })

        interactiveBracket = new BracketRenderer({
            container,
            teams,
            teamNames,
            interactive: true,
            onChange: (data) => { window.bracketData = data }
        })
        interactiveBracket.render()
        return
    }

    if (shuffleContainer) shuffleContainer.style.display = 'block'

    const groupCount = format === 'Король корта (каждый с каждым)' ? 1 : (parseInt(document.getElementById('group-count').value) || 2)
    container.innerHTML = ''

    if (groupCount === 1) {
        container.innerHTML = `<div class="group-container" data-group="all"><div class="group-title">Все команды</div><div class="group-teams" id="group-all"></div></div>`
    } else {
        for (let i = 0; i < groupCount; i++) {
            const letter = getGroupLetter(String(i))
            container.innerHTML += `<div class="group-container" data-group="${letter}"><div class="group-title">Группа ${letter}</div><div class="group-teams" id="group-${letter}"></div></div>`
        }
    }

    const groupContainers = document.querySelectorAll('.group-teams')
    if (groupContainers.length === 0) {
        container.innerHTML = '<div style="padding:20px;color:red;">Ошибка: нет контейнеров для групп</div>'
        return
    }

    teams.forEach((team, i) => {
        const name = getTeamNameFromTeam(team)
        groupContainers[i % groupContainers.length].innerHTML += `
            <div class="team-item" draggable="true" data-team-id="${team.teamId}"><span>${name}</span></div>`
    })

    enableDragAndDrop()
    validateForm()
}

// ============================================================
// DRAG-AND-DROP
// ============================================================

let draggedItem = null

function dragStartHandler(e) {
    draggedItem = this
    this.classList.add('dragging')
    e.dataTransfer.setData('text/plain', this.dataset.teamId || '')
    e.dataTransfer.effectAllowed = 'move'
}

function dragEndHandler() {
    this.classList.remove('dragging')
    draggedItem = null
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'))
}

function dragOverHandler(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    this.classList.add('drag-over')
}

function dragLeaveHandler() {
    this.classList.remove('drag-over')
}

function enableDragAndDrop() {
    document.querySelectorAll('.group-teams .team-item').forEach(item => {
        item.setAttribute('draggable', 'true')
        item.removeEventListener('dragstart', dragStartHandler)
        item.removeEventListener('dragend', dragEndHandler)
        item.addEventListener('dragstart', dragStartHandler)
        item.addEventListener('dragend', dragEndHandler)
    })

    document.querySelectorAll('.group-teams, .group-teams .team-item').forEach(target => {
        target.removeEventListener('dragover', dragOverHandler)
        target.removeEventListener('dragleave', dragLeaveHandler)
        target.removeEventListener('drop', dropHandler)
        target.addEventListener('dragover', dragOverHandler)
        target.addEventListener('dragleave', dragLeaveHandler)
        target.addEventListener('drop', dropHandler)
    })
}

function dropHandler(e) {
    e.preventDefault()
    this.classList.remove('drag-over')
    if (!draggedItem || draggedItem === this) return
    if (!this.classList.contains('team-item')) return

    const pa = draggedItem.parentNode
    const pb = this.parentNode
    const na = draggedItem.nextSibling
    const nb = this.nextSibling

    if (pa === pb) {
        if (na === this) pa.insertBefore(this, draggedItem)
        else if (nb === draggedItem) pa.insertBefore(draggedItem, this)
        else { pa.insertBefore(draggedItem, nb); pa.insertBefore(this, na) }
    } else {
        pa.insertBefore(this, na)
        pb.insertBefore(draggedItem, nb)
    }

    draggedItem.classList.remove('dragging')
    draggedItem = null
    validateForm()
}

// ============================================================
// ПЕРЕМЕШИВАНИЕ
// ============================================================

function shuffleTeams() {
    const format = document.getElementById('tournament-format').value

    if (format === 'Олимпийская система (на вылет)') {
        if (interactiveBracket) {
            const data = [...interactiveBracket.teams]
            for (let i = data.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                ;[data[i], data[j]] = [data[j], data[i]]
            }
            interactiveBracket.render(data)
        }
    } else {
        const containers = document.querySelectorAll('.group-teams')
        const all = []
        containers.forEach(c => { all.push(...c.querySelectorAll('.team-item')); c.innerHTML = '' })

        for (let i = all.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[all[i], all[j]] = [all[j], all[i]]
        }

        all.forEach((item, i) => containers[i % containers.length].appendChild(item))
        enableDragAndDrop()
        validateForm()
    }
}

// ============================================================
// ВАЛИДАЦИЯ И ОТПРАВКА
// ============================================================

function validateForm() {
    const format = document.getElementById('tournament-format').value
    const msg = document.getElementById('validation-message')
    msg.style.display = 'none'
    msg.classList.remove('visible')

    if (format === 'Олимпийская система (на вылет)') {
        if (interactiveBracket) {
            const data = interactiveBracket.getData()
            if (data.slots.filter(s => s.teamId).length < 2) {
                msg.textContent = 'Минимум 2 команды'
                msg.style.display = 'block'
                msg.classList.add('visible')
                return false
            }
        }
        return true
    }

    const groupCount = format === 'Король корта (каждый с каждым)' ? 1 : (parseInt(document.getElementById('group-count').value) || 2)
    const containers = document.querySelectorAll('.group-teams')
    let total = 0
    containers.forEach(c => { total += c.querySelectorAll('.team-item').length })

    if (total < 2) {
        msg.textContent = 'Минимум 2 команды'
        msg.style.display = 'block'
        msg.classList.add('visible')
        return false
    }

    if (format !== 'Король корта (каждый с каждым)') {
        const advance = parseInt(document.getElementById('advance-count').value) || 1
        if (advance > Math.floor(total / groupCount)) {
            msg.textContent = `Из группы может выйти не более ${Math.floor(total / groupCount)} команд`
            msg.style.display = 'block'
            msg.classList.add('visible')
            return false
        }
    }

    for (let i = 0; i < containers.length; i++) {
        if (containers[i].querySelectorAll('.team-item').length < 2) {
            msg.textContent = `В группе ${containers.length === 1 ? 'всех команд' : getGroupLetter(String(i))} меньше 2 команд`
            msg.style.display = 'block'
            msg.classList.add('visible')
            return false
        }
    }

    return true
}

document.getElementById('start-tournament-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    const eventId = document.getElementById('event-id').value
    const formData = new FormData(e.target)
    const data = Object.fromEntries(formData)

    if (tournament.tournamentFormat === 'Олимпийская система (на вылет)') {
        if (interactiveBracket) {
            const bracketData = interactiveBracket.getData()
            data.bracket = bracketData.matches
            data.bracketStructure = bracketData.slots
        }
    } else {
        const groups = {}
        document.querySelectorAll('.group-container').forEach(group => {
            groups[group.dataset.group] = Array.from(group.querySelectorAll('.team-item')).map(el => el.dataset.teamId)
        })
        data.groups = groups
    }

    try {
        await apiPut(`/events/${eventId}/start`, data)
        window.location.href = `activeTournament.html?id=${eventId}`
    } catch (error) {
        alert(error.message || 'Ошибка при запуске турнира')
        if (error.data?.redirect) window.location.href = error.data.redirect
    }
})

loadTournament()
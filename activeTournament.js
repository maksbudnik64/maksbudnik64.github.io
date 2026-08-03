import { checkAuth, updateUserCard } from './auth.js'
import { apiGet, apiPut, apiPost, apiDelete } from './api.js'
import { BracketRenderer } from './bracketRenderer.js'
import {
    parseTeamPlayers,
    getTeamNameFromMatch,
    getTeamNameFromTeam,
    getGroupLetter,
    getRoundName,
    nextPowerOfTwo,
    compareTeamRating
} from './utils.js'

// Состояние
let currentUser = null
let tournament = null
let tournamentData = null
let currentTab = 'standings'
let groupStageCompleted = false
let interactivePlayoffBracket = null

let currentSets = []
let currentSetIndex = 0
const MAX_SETS = 5

let contentContainer = null
let counterSectionEl = null
let sectionGroups = null
let sectionBracket = null

// ============================================================
// ЗАГРУЗКА ТУРНИРА
// ============================================================

async function loadTournament() {
    const user = await checkAuth()
    if (!user) return
    currentUser = user
    updateUserCard(user)

    const params = new URLSearchParams(window.location.search)
    const eventId = params.get('id')
    if (!eventId) {
        alert('Турнир не указан')
        return
    }

    try {
        const eventData = await apiGet(`/events/${eventId}`)
        tournament = eventData.event

        const finishBtn = document.getElementById('finish-tournament-btn')
        if (finishBtn) finishBtn.style.display = isCreator() ? 'flex' : 'none'

        document.getElementById('tournament-title').textContent = tournament.title
        document.getElementById('tournament-info').innerHTML = `
            <i class="fas fa-trophy" style="color:#c49a2c;"></i> 
            ${tournament.tournamentFormat || 'Турнир'} · 
            ${tournament.status === 'confirmed' ? 'Активен' : tournament.status}
            ${tournament.tournamentGender ? ` · ${tournament.tournamentGender}` : ''}
        `

        contentContainer = document.getElementById('content-container')
        counterSectionEl = document.getElementById('section-counter')
        sectionGroups = document.getElementById('section-groups')
        sectionBracket = document.getElementById('section-bracket')

        if (sectionGroups) sectionGroups.innerHTML = ''
        if (sectionBracket) sectionBracket.innerHTML = ''

        const format = tournament.tournamentFormat
        const standingsTab = document.getElementById('tab-standings')
        const matchesTab = document.getElementById('tab-matches')
        const bracketTab = document.getElementById('tab-bracket')
        const counterTab = document.getElementById('tab-counter')

        // Настройка интерфейса в зависимости от формата турнира
        if (format === 'Олимпийская система (на вылет)') {
            setTabs({ standings: false, matches: false, bracket: true, counter: true }, bracketTab)
            if (sectionGroups) sectionGroups.style.display = 'none'
            if (sectionBracket) sectionBracket.style.display = 'block'
            if (counterSectionEl) counterSectionEl.style.display = 'block'
            await loadPlayoffBracket(eventId)
        } else if (format === 'Групповой этап + плей-офф') {
            setTabs({ standings: true, matches: true, bracket: true, counter: true }, standingsTab)
            if (sectionGroups) sectionGroups.style.display = 'block'
            if (sectionBracket) sectionBracket.style.display = 'block'
            if (counterSectionEl) counterSectionEl.style.display = 'block'
            await loadGroupStage(eventId)
        } else {
            setTabs({ standings: true, matches: true, bracket: false, counter: true }, standingsTab)
            if (sectionGroups) sectionGroups.style.display = 'block'
            if (sectionBracket) sectionBracket.style.display = 'none'
            if (counterSectionEl) counterSectionEl.style.display = 'block'
            await loadGroupStage(eventId)
        }

        await loadMatchesForCounter(eventId)

        // Обработчики вкладок и кнопок
        if (standingsTab) standingsTab.addEventListener('click', () => switchTab('standings'))
        if (matchesTab) matchesTab.addEventListener('click', () => switchTab('matches'))
        if (bracketTab) bracketTab.addEventListener('click', () => switchTab('bracket'))
        if (counterTab) counterTab.addEventListener('click', () => switchTab('counter'))

        document.getElementById('finish-tournament-btn').addEventListener('click', finishTournament)
        document.getElementById('btn-reset-score').addEventListener('click', resetCurrentSet)
        document.getElementById('btn-next-set').addEventListener('click', finishCurrentSet)
        document.getElementById('btn-finish-match').addEventListener('click', finishMatch)

        document.querySelector('[data-js-counter-button-left-plus]')?.addEventListener('click', leftPlusClick)
        document.querySelector('[data-js-counter-button-left-minus]')?.addEventListener('click', leftMinusClick)
        document.querySelector('[data-js-counter-button-right-plus]')?.addEventListener('click', rightPlusClick)
        document.querySelector('[data-js-counter-button-right-minus]')?.addEventListener('click', rightMinusClick)

        const activeTab = document.querySelector('.filterGroup .buttonAccent')
        switchTab(activeTab ? activeTab.id.replace('tab-', '') : 'standings')

    } catch (error) {
        console.error('Ошибка загрузки турнира:', error)
        if (sectionGroups) {
            sectionGroups.innerHTML = `
                <div class="card" style="text-align: center; padding: 40px;">
                    <div style="font-size: 3rem; margin-bottom: 12px;">😔</div>
                    <div class="font-bold" style="font-size: 1.2rem; margin-bottom: 8px;">Ошибка загрузки</div>
                    <div class="text-muted">${error.message || 'Попробуйте обновить страницу'}</div>
                </div>`
        }
    }
}

// Настройка видимости вкладок
function setTabs(config, activeTab) {
    const tabs = {
        standings: document.getElementById('tab-standings'),
        matches: document.getElementById('tab-matches'),
        bracket: document.getElementById('tab-bracket'),
        counter: document.getElementById('tab-counter')
    }
    for (const [key, tab] of Object.entries(tabs)) {
        if (tab) tab.style.display = config[key] ? 'inline-block' : 'none'
    }
    document.querySelectorAll('.filterGroup button').forEach(b => b.classList.remove('buttonAccent'))
    if (activeTab) activeTab.classList.add('buttonAccent')
}

// ============================================================
// ГРУППОВОЙ ЭТАП
// ============================================================

async function loadGroupStage(eventId) {
    try {
        const teamsData = await apiGet(`/events/${eventId}/teams`)
        if (!teamsData.success || teamsData.teams.length === 0) {
            if (sectionGroups) sectionGroups.innerHTML = '<div class="card" style="text-align:center;padding:40px;">Нет команд в турнире</div>'
            return
        }

        const groups = {}
        teamsData.teams.forEach(team => {
            team.players = parseTeamPlayers(team.players)
            const groupName = getGroupLetter(team.groupName || 'all')
            if (!groups[groupName]) groups[groupName] = []
            groups[groupName].push(team)
        })

        const matchesData = await apiGet(`/events/${eventId}/matches`)
        const allMatches = (matchesData.success ? matchesData.matches || [] : []).map(match => {
            match.team1Players = parseTeamPlayers(match.team1Players)
            match.team2Players = parseTeamPlayers(match.team2Players)
            return match
        })

        const groupNames = Object.keys(groups).filter(name => name !== 'all')
        const advanceCount = tournament?.advanceCount || 1
        tournamentData = { groups, matches: allMatches, eventId, advanceCount, groupCount: groupNames.length }

        renderGroups(groups, allMatches)
        groupStageCompleted = allMatches.filter(m => m.stageLevel === 0).every(m => m.winnerId !== null)

        if (tournament.tournamentStatus === 'playoff') {
            await loadPlayoffBracket(eventId)
        } else if (groupStageCompleted && groupNames.length > 0) {
            renderPlayoffGenerationButton(groups, eventId)
        } else {
            renderPlayoffWaitingMessage()
        }
    } catch (error) {
        console.error('Ошибка загрузки групповой стадии:', error)
        if (sectionGroups) sectionGroups.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:red;">Ошибка: ${error.message}</div>`
    }
}

// ============================================================
// РЕНДЕР ГРУПП
// ============================================================

function renderStandings(teams, matches) {
    if (!teams || teams.length === 0) return '<div style="padding:12px;color:#6b7583;">Нет команд</div>'

    const standings = teams.map(team => {
        const teamMatches = matches.filter(m => m.team1Id === team.teamId || m.team2Id === team.teamId)
        return {
            ...team,
            played: teamMatches.filter(m => m.winnerId !== null).length,
            wins: teamMatches.filter(m => m.winnerId === team.teamId).length,
            points: team.points || 0
        }
    })
    standings.sort(compareTeamRating)

    let html = '<div class="standings-header"><span>#</span><span>Команда</span><span>И</span><span>В</span><span>О</span></div>'

    standings.forEach((team, index) => {
        const position = index + 1
        const rowClass = position <= 3 ? `standings-row standings-row-${position}` : 'standings-row'
        html += `
            <div class="${rowClass}">
                <span>${position}</span><span>${getTeamNameFromTeam(team)}</span>
                <span>${team.played}</span><span>${team.wins}</span>
                <span class="standings-points">${team.points}</span>
            </div>`
    })
    return html
}

function renderMatches(matches) {
    if (!matches || matches.length === 0) return '<div style="padding:12px;color:#6b7583;">Нет матчей</div>'
    return `<div class="matches-grid">${matches.map(match => {
        const isFinished = match.winnerId !== null
        return `
            <div class="matchRow ${isFinished ? 'matchRow-finished' : ''}"
                 ${!isFinished ? `data-match-id="${match.matchId}" onclick="selectMatch(${match.matchId})"` : ''}>
                <span class="matchTeam">${getTeamNameFromMatch(match, 'team1')}</span>
                <span class="matchVs">VS</span>
                <span class="matchTeam">${getTeamNameFromMatch(match, 'team2')}</span>
                <span class="matchScore">${isFinished ? `${match.setsTeam1 || 0}:${match.setsTeam2 || 0}` : '—:—'}</span>
            </div>`
    }).join('')}</div>`
}

// ============================================================
// ВЫБОР МАТЧА ИЗ ТАБЛИЦЫ
// ============================================================

window.selectMatch = function(matchId) {
    const matchSelect = document.getElementById('counter-match-select')
    if (!matchSelect) return

    // Проверяем, есть ли уже выбранный матч и не тот же самый
    const currentMatchId = matchSelect.value
    if (currentMatchId && currentMatchId != matchId) {
        // Проверяем, есть ли незавершённый счёт
        const hasScore = checkHasUnsavedScore()
        if (hasScore) {
            const confirmed = confirm(
                '⚠️ У вас есть незавершённый счёт в текущем матче.\n\n' +
                'При переходе к другому матчу счёт будет сброшен.\n\n' +
                'Вы уверены, что хотите перейти?'
            )
            if (!confirmed) return
        }
    }

    // Находим нужную опцию
    for (let i = 0; i < matchSelect.options.length; i++) {
        if (matchSelect.options[i].value == matchId) {
            matchSelect.selectedIndex = i
            // Вызываем событие change для обновления счётчика
            matchSelect.dispatchEvent(new Event('change'))
            
            // Переключаем на вкладку счётчика
            switchTab('counter')
            
            // Скроллим к счётчику
            const counterSection = document.getElementById('section-counter')
            if (counterSection) {
                counterSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            break
        }
    }
}

/**
 * Проверяет, есть ли незавершённый счёт в текущем матче
 * Возвращает true, если есть что сбрасывать
 */
function checkHasUnsavedScore() {
    // Проверяем текущий сет
    const set = currentSets[currentSetIndex]
    if (set && !set.finished && (set.team1 > 0 || set.team2 > 0)) {
        return true
    }
    
    // Проверяем, есть ли завершённые сеты
    const hasFinishedSets = currentSets.some(s => s.finished)
    if (hasFinishedSets) {
        return true
    }
    
    return false
}

function renderGroups(groups, allMatches) {
    if (!sectionGroups) return
    sectionGroups.innerHTML = ''
    const groupNames = Object.keys(groups).filter(name => name !== 'all' && name !== '')

    if (groupNames.length === 0) {
        sectionGroups.appendChild(createGroupBlock('all', groups['all'] || [], allMatches))
    } else {
        groupNames.sort().forEach(groupName => {
            const groupTeams = groups[groupName] || []
            const groupMatches = allMatches.filter(m =>
                groupTeams.some(t => t.teamId === m.team1Id) &&
                groupTeams.some(t => t.teamId === m.team2Id)
            )
            sectionGroups.appendChild(createGroupBlock(groupName, groupTeams, groupMatches))
        })
    }
}

function createGroupBlock(groupName, groupTeams, groupMatches) {
    const block = document.createElement('div')
    block.className = 'group-section'
    block.dataset.group = groupName
    block.innerHTML = `
        <div class="cardHeader" style="margin-bottom: 12px;">
            <h3><i class="fas fa-layer-group" style="color:#c49a2c;"></i> ${groupName === 'all' ? 'Все команды' : `Группа ${groupName}`}</h3>
            <span class="tag">${groupMatches.length} матчей</span>
        </div>
        <div class="mainBoard">
            <div class="card"><div class="cardHeader"><h3>Таблица</h3></div>${renderStandings(groupTeams, groupMatches)}</div>
            <div class="card"><div class="cardHeader"><h3>Матчи</h3></div>${renderMatches(groupMatches)}</div>
        </div>`
    return block
}

// ============================================================
// ПЛЕЙ-ОФФ
// ============================================================

function generatePlayoffFromGroupStage(groups, advanceCount) {
    const qualifiedTeams = []
    const groupNames = Object.keys(groups).filter(name => name !== 'all' && name !== '')

    groupNames.forEach(groupName => {
        const groupTeams = [...(groups[groupName] || [])]
        groupTeams.sort(compareTeamRating)
        groupTeams.slice(0, advanceCount).forEach((team, index) => {
            if (team.teamId) {
                qualifiedTeams.push({
                    teamId: team.teamId, groupName, position: index + 1,
                    displayName: getTeamNameFromTeam(team),
                    points: team.points || 0, setsWon: team.setsWon || 0, setsLost: team.setsLost || 0
                })
            }
        })
    })
    return qualifiedTeams
}

function buildPlayoffBracket(qualifiedTeams, totalSlots) {
    const validTeams = qualifiedTeams.filter(t => t.teamId)
    if (validTeams.length === 0) return []

    const groupsMap = {}
    validTeams.forEach(t => {
        if (!groupsMap[t.groupName]) groupsMap[t.groupName] = []
        groupsMap[t.groupName].push(t)
    })
    Object.values(groupsMap).forEach(g => g.sort(compareTeamRating))

    const groupNames = Object.keys(groupsMap).sort()
    const maxPosition = Math.max(...Object.values(groupsMap).map(g => g.length))

    // Сбор команд по позициям из разных групп
    const ordered = []
    for (let pos = 1; pos <= maxPosition; pos++) {
        const positionTeams = []
        groupNames.forEach(g => {
            if (groupsMap[g].length >= pos) {
                positionTeams.push({ ...groupsMap[g][pos - 1], position: pos, groupName: g })
            }
        })
        positionTeams.sort(compareTeamRating)
        ordered.push(...positionTeams)
    }

    const totalTeams = ordered.length
    const byeCount = totalSlots - totalTeams
    const slots = Array.from({ length: totalSlots }, (_, i) => ({ id: i, teamId: null, isBye: false, teamData: null }))
    const byeTeams = ordered.slice(0, byeCount)
    const playingTeams = ordered.slice(byeCount)

    // Распределение BYE
    if (byeCount > 0) {
        const step = totalSlots / (byeCount + 1)
        for (let i = 0; i < byeCount; i++) {
            const pos = Math.min(Math.round((i + 1) * step) - 1, totalSlots - 1)
            slots[pos].teamId = byeTeams[i].teamId
            slots[pos].isBye = true
            slots[pos].teamData = byeTeams[i]
        }
    }

    // Формирование пар из разных групп
    const pairs = []
    const used = new Set()

    for (let i = 0; i < playingTeams.length; i++) {
        if (used.has(i)) continue
        const team1 = playingTeams[i]
        let pairFound = false

        for (let j = playingTeams.length - 1; j > i; j--) {
            if (used.has(j)) continue
            if (team1.groupName !== playingTeams[j].groupName) {
                pairs.push({ team1, team2: playingTeams[j] })
                used.add(i); used.add(j)
                pairFound = true
                break
            }
        }

        if (!pairFound) {
            for (let j = playingTeams.length - 1; j > i; j--) {
                if (used.has(j)) continue
                pairs.push({ team1, team2: playingTeams[j] })
                used.add(i); used.add(j)
                pairFound = true
                break
            }
        }

        if (!pairFound) {
            pairs.push({ team1, team2: null })
            used.add(i)
        }
    }

    const freeSlots = slots.map((s, i) => i).filter(i => !slots[i].teamId)
    let pairIndex = 0

    for (let i = 0; i < freeSlots.length && pairIndex < pairs.length; i += 2) {
        const slotA = freeSlots[i], slotB = freeSlots[i + 1], pair = pairs[pairIndex]
        if (slotA !== undefined) {
            slots[slotA].teamId = pair.team1.teamId
            slots[slotA].teamData = pair.team1
            if (!pair.team2) slots[slotA].isBye = true
        }
        if (slotB !== undefined && pair.team2) {
            slots[slotB].teamId = pair.team2.teamId
            slots[slotB].teamData = pair.team2
        }
        pairIndex++
    }

    slots.forEach(s => { if (!s.teamId) s.isBye = true })
    return slots
}

function renderPlayoffGenerationButton(groups, eventId) {
    if (!sectionBracket) return

    if (!isCreator()) {
        sectionBracket.innerHTML = `
            <div class="card" style="text-align:center;padding:40px;">
                <div style="font-size: 2rem; margin-bottom: 12px;">🏆</div>
                <div class="font-bold" style="font-size: 1.2rem; margin-bottom: 8px;">Групповой этап завершён!</div>
                <div class="text-muted">Ожидайте, организатор формирует сетку плей-офф</div>
            </div>`
        return
    }

    const advanceCount = tournamentData?.advanceCount || 1
    const qualifiedTeams = generatePlayoffFromGroupStage(groups, advanceCount)

    if (qualifiedTeams.length < 2) {
        sectionBracket.innerHTML = '<div class="card" style="text-align:center;padding:40px;">Недостаточно команд для плей-офф</div>'
        return
    }

    const totalSlots = nextPowerOfTwo(qualifiedTeams.length)
    const slots = buildPlayoffBracket(qualifiedTeams, totalSlots)

    const groupNames = [...new Set(qualifiedTeams.map(t => t.groupName))].sort()
    let teamsListHtml = '<div class="playoff-teams-list"><strong>📋 Команды, вышедшие из групп:</strong><div class="playoff-teams-tags">'
    groupNames.forEach(g => {
        const teams = qualifiedTeams.filter(t => t.groupName === g).sort((a, b) => a.position - b.position)
        teamsListHtml += `<span class="tag">Группа ${g}: ${teams.map(t => t.displayName).join(', ')}</span>`
    })
    teamsListHtml += '</div></div>'

    sectionBracket.innerHTML = `
        <div class="card">
            <div class="cardHeader">
                <h3><i class="fas fa-sitemap" style="color:#c49a2c;"></i> Сетка плей-офф</h3>
                <span class="tag">${qualifiedTeams.length} команд</span>
            </div>
            <div class="playoff-info">
                <p class="font-semibold mb-8">✅ Групповой этап завершён!</p>
                <p class="text-sm" style="color: #5f6b7a;">Из групп выходят ${advanceCount} команд${advanceCount > 1 ? 'ы' : ''}.</p>
                ${teamsListHtml}
            </div>
            <div id="playoff-bracket-container"></div>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <button id="confirm-playoff-btn" class="buttonAccent" style="padding: 12px 32px; font-size: 1.1rem;">
                    <i class="fas fa-check-circle"></i> Подтвердить сетку и начать плей-офф
                </button>
            </div>
        </div>`

    const teamNames = {}
    qualifiedTeams.forEach(t => { if (t.teamId) teamNames[t.teamId] = t.displayName })

    interactivePlayoffBracket = new BracketRenderer({
        container: document.getElementById('playoff-bracket-container'),
        teams: qualifiedTeams.filter(t => t.teamId).map(t => ({ teamId: t.teamId })),
        teamNames,
        interactive: true,
        onChange: (data) => { window.playoffBracketData = data }
    })
    interactivePlayoffBracket.renderStaticWithSlots(slots)

    document.getElementById('confirm-playoff-btn')?.addEventListener('click', () => confirmPlayoffBracket(eventId))
}

function renderPlayoffWaitingMessage() {
    if (!sectionBracket) return
    sectionBracket.innerHTML = `
        <div class="card" style="text-align:center;padding:40px;">
            <div style="font-size: 2rem; margin-bottom: 12px;">⏳</div>
            <div class="font-bold" style="font-size: 1.2rem; margin-bottom: 8px;">Сетка плей-офф</div>
            <div class="text-muted">Доступна после завершения всех матчей группового этапа</div>
        </div>`
}

function renderTournamentBracket(matches) {
    const playoffMatches = matches.filter(m => m.stageLevel > 0)
    if (playoffMatches.length === 0) return '<div class="card" style="text-align:center;padding:40px;">Нет матчей плей-офф</div>'

    const teamNames = {}
    playoffMatches.forEach(m => {
        if (m.team1Id) teamNames[m.team1Id] = getTeamNameFromMatch(m, 'team1')
        if (m.team2Id) teamNames[m.team2Id] = getTeamNameFromMatch(m, 'team2')
    })

    const tempContainer = document.createElement('div')
    const renderer = new BracketRenderer({
        container: tempContainer,
        parseTeamPlayers,
        teamNames,
        interactive: false
    })
    renderer.renderFromMatches(playoffMatches)
    return tempContainer.innerHTML
}

async function loadPlayoffBracket(eventId) {
    try {
        const data = await apiGet(`/events/${eventId}/matches/bracket`)
        if (!sectionBracket) return

        if (!data.success || !data.matches?.length) {
            sectionBracket.innerHTML = '<div class="card" style="text-align:center;padding:40px;">Сетка ещё не создана</div>'
            return
        }

        const matches = data.matches.map(m => ({
            ...m,
            team1Players: parseTeamPlayers(m.team1Players),
            team2Players: parseTeamPlayers(m.team2Players)
        }))

        sectionBracket.innerHTML = renderTournamentBracket(matches)
    } catch (error) {
        console.error('Ошибка загрузки сетки:', error)
        if (sectionBracket) sectionBracket.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:red;">Ошибка: ${error.message}</div>`
    }
}

async function confirmPlayoffBracket(eventId) {
    if (!interactivePlayoffBracket) {
        alert('Сетка не инициализирована')
        return
    }

    const bracketData = interactivePlayoffBracket.getData()
    if (!bracketData.matches?.length) {
        alert('Сетка пуста')
        return
    }

    if (!confirm('Подтвердить сетку плей-офф? Это действие запустит плей-офф турнира.')) return

    try {
        await apiPost(`/events/${eventId}/matches/playoff`, {
            bracket: bracketData.matches,
            slots: bracketData.slots
        })
        alert('✅ Сетка плей-офф создана!')
        window.location.reload()
    } catch (error) {
        alert(error.message || 'Ошибка создания сетки')
    }
}

// ============================================================
// СЧЁТЧИК МАТЧА
// ============================================================

function initializeSets() {
    currentSets = []
    currentSetIndex = 0
    addNewSet()
    updateButtonsState()
}

function addNewSet() {
    if (currentSets.length >= MAX_SETS) {
        showMessage(`Максимум ${MAX_SETS} сетов`, 'error')
        return
    }
    currentSets.push({ team1: 0, team2: 0, finished: false, winner: null })
    currentSetIndex = currentSets.length - 1
    updateMainScore()
    updateSetsSummary()
    updateButtonsState()
}

// Сохранение и восстановление состояния сета
function saveSetSnapshot() {
    const set = currentSets[currentSetIndex]
    if (!set) return null
    return {
        team1: set.team1,
        team2: set.team2,
        finished: set.finished,
        winner: set.winner,
        index: currentSetIndex
    }
}

function restoreSetSnapshot(snapshot) {
    if (!snapshot) return
    const set = currentSets[snapshot.index]
    if (!set) return
    set.team1 = snapshot.team1
    set.team2 = snapshot.team2
    set.finished = snapshot.finished
    set.winner = snapshot.winner
    currentSetIndex = snapshot.index
    updateMainScore()
    updateSetsSummary()
    updateButtonsState()
}

async function loadMatchesForCounter(eventId) {
    try {
        const data = await apiGet(`/events/${eventId}/matches`)
        if (!data.success || !data.matches) return

        const matchSelect = document.getElementById('counter-match-select')
        if (!matchSelect) return

        matchSelect.innerHTML = '<option value="">-- Выберите матч --</option>'

        const availableMatches = data.matches.filter(m => m.team1Id && m.team2Id && !m.winnerId)
        if (availableMatches.length === 0) {
            matchSelect.innerHTML += '<option value="">-- Нет доступных матчей --</option>'
            return
        }

        const teamsData = await apiGet(`/events/${eventId}/teams`)
        const teamGroupMap = {}
        if (teamsData.success && teamsData.teams) {
            teamsData.teams.forEach(team => {
                if (team.groupName) teamGroupMap[team.teamId] = getGroupLetter(team.groupName)
            })
        }

        const maxStageLevel = Math.max(...data.matches.map(m => m.stageLevel || 0))

        availableMatches.sort((a, b) => {
            if (a.stageLevel === 0 && b.stageLevel > 0) return -1
            if (a.stageLevel > 0 && b.stageLevel === 0) return 1
            return (a.matchIndex || 0) - (b.matchIndex || 0)
        })

        availableMatches.forEach(match => {
            const name1 = getTeamNameFromMatch(match, 'team1')
            const name2 = getTeamNameFromMatch(match, 'team2')

            let prefix
            if (match.stageLevel === 0) {
                const g1 = teamGroupMap[match.team1Id], g2 = teamGroupMap[match.team2Id]
                prefix = (g1 && g2 && g1 === g2) ? `Группа ${g1}` : `Группа ${g1 || g2 || ''}`
            } else {
                prefix = getRoundName(match.stageLevel, maxStageLevel)
            }

            const option = document.createElement('option')
            option.value = match.matchId
            option.textContent = `${prefix}: ${name1} vs ${name2}`
            option.dataset.team1Id = match.team1Id
            option.dataset.team2Id = match.team2Id
            option.dataset.team1Name = name1
            option.dataset.team2Name = name2
            option.dataset.roundName = prefix
            matchSelect.appendChild(option)
        })

        matchSelect.addEventListener('change', onMatchSelect)
    } catch (error) {
        console.error('Ошибка загрузки матчей:', error)
    }
}

function onMatchSelect(event) {
    const option = event.target.options[event.target.selectedIndex]
    const resetBtn = document.getElementById('btn-reset-score')
    const nextSetBtn = document.getElementById('btn-next-set')
    const finishMatchBtn = document.getElementById('btn-finish-match')

    if (!option?.value) {
        document.getElementById('counter-team1-display').textContent = 'Команда 1'
        document.getElementById('counter-team2-display').textContent = 'Команда 2'
        document.getElementById('match-status-tag').textContent = 'Выберите матч'
        resetBtn.disabled = nextSetBtn.disabled = finishMatchBtn.disabled = true
        return
    }

    document.getElementById('counter-team1-display').textContent = option.dataset.team1Name
    document.getElementById('counter-team2-display').textContent = option.dataset.team2Name
    document.getElementById('match-status-tag').textContent = option.dataset.roundName || 'Матч'
    document.getElementById('counter').dataset.currentMatchId = option.value

    initializeSets()
    resetBtn.disabled = nextSetBtn.disabled = finishMatchBtn.disabled = false
}

function showMessage(text, type) {
    const el = document.querySelector('[data-js-auth-message]')
    if (el) {
        el.textContent = text
        el.className = `authMessage ${type}`
        el.style.display = 'block'
        setTimeout(() => { el.className = 'authMessage'; el.style.display = 'none' }, 5000)
    }
}

function updateMainScore() {
    const set = currentSets[currentSetIndex]
    if (!set) return
    document.querySelector('[data-js-count-left]').textContent = set.team1
    document.querySelector('[data-js-count-right]').textContent = set.team2
}

function updateSetsSummary() {
    document.getElementById('sets-team1-count').textContent = currentSets.filter(s => s.winner === 1).length
    document.getElementById('sets-team2-count').textContent = currentSets.filter(s => s.winner === 2).length
}

function leftPlusClick() {
    const set = currentSets[currentSetIndex]
    if (!set || set.finished || set.team1 >= 100) return
    if (set.team1 >= 21 && (set.team1 - set.team2) >= 2) return
    set.team1++
    updateMainScore()
}

function leftMinusClick() {
    const set = currentSets[currentSetIndex]
    if (!set || set.finished || set.team1 <= 0) return
    set.team1--
    updateMainScore()
}

function rightPlusClick() {
    const set = currentSets[currentSetIndex]
    if (!set || set.finished || set.team2 >= 100) return
    if (set.team2 >= 21 && (set.team2 - set.team1) >= 2) return
    set.team2++
    updateMainScore()
}

function rightMinusClick() {
    const set = currentSets[currentSetIndex]
    if (!set || set.finished || set.team2 <= 0) return
    set.team2--
    updateMainScore()
}

function finishMatch() {
    const snapshot = saveSetSnapshot()
    const set = currentSets[currentSetIndex]

    let team1Sets = currentSets.filter(s => s.winner === 1).length
    let team2Sets = currentSets.filter(s => s.winner === 2).length

    if (set && !set.finished && set.team1 + set.team2 > 0 && Math.abs(set.team1 - set.team2) >= 2) {
        set.winner = set.team1 > set.team2 ? 1 : 2
        set.finished = true
        if (set.winner === 1) team1Sets++; else team2Sets++
    }

    if (team1Sets === 0 && team2Sets === 0) {
        showMessage('Нет завершённых сетов', 'error')
        restoreSetSnapshot(snapshot)
        return
    }

    if (team1Sets === team2Sets) {
        showMessage('Ничья по сетам', 'error')
        restoreSetSnapshot(snapshot)
        return
    }

    const winner = team1Sets > team2Sets ? 1 : 2
    const winnerName = winner === 1
        ? document.getElementById('counter-team1-display').textContent
        : document.getElementById('counter-team2-display').textContent

    if (!confirm(`🏆 Завершить матч? Победитель: ${winnerName} (${team1Sets}:${team2Sets})`)) {
        restoreSetSnapshot(snapshot)
        return
    }

    updateSetsSummary()
    saveMatchResult()
}

function finishCurrentSet() {
    const set = currentSets[currentSetIndex]
    if (!set || set.finished || currentSets.length >= MAX_SETS) return

    if (set.team1 === 0 && set.team2 === 0) {
        showMessage('Счёт 0:0', 'error')
        return
    }
    if (Math.abs(set.team1 - set.team2) < 2) {
        showMessage('Разница минимум 2 очка', 'error')
        return
    }

    const snapshot = saveSetSnapshot()

    set.winner = set.team1 > set.team2 ? 1 : 2
    set.finished = true
    updateSetsSummary()
    updateButtonsState()

    const winnerName = set.winner === 1
        ? document.getElementById('counter-team1-display').textContent
        : document.getElementById('counter-team2-display').textContent
    showMessage(`✅ Сет завершён! Победитель: ${winnerName}`, 'success')

    if (currentSets.length >= MAX_SETS) return
    setTimeout(() => { addNewSet() }, 300)
}

function resetCurrentSet() {
    const set = currentSets[currentSetIndex]
    if (!set || set.finished) {
        showMessage('Нельзя сбросить завершённый сет', 'error')
        return
    }
    set.team1 = set.team2 = 0
    updateMainScore()
    showMessage('Счёт сброшен', 'success')
}

async function saveMatchResult() {
    const params = new URLSearchParams(window.location.search)
    const eventId = params.get('id')
    const matchId = document.getElementById('counter')?.dataset.currentMatchId

    if (!matchId) {
        showMessage('Выберите матч', 'error')
        return
    }

    const team1Sets = currentSets.filter(s => s.winner === 1).length
    const team2Sets = currentSets.filter(s => s.winner === 2).length

    if (team1Sets === 0 && team2Sets === 0) {
        showMessage('Нет завершённых сетов', 'error')
        return
    }

    const option = document.getElementById('counter-match-select')?.selectedOptions[0]
    if (!option) return

    const winnerId = team1Sets > team2Sets
        ? parseInt(option.dataset.team1Id)
        : parseInt(option.dataset.team2Id)

    const resetBtn = document.getElementById('btn-reset-score')
    const nextSetBtn = document.getElementById('btn-next-set')
    const finishMatchBtn = document.getElementById('btn-finish-match')

    resetBtn.disabled = true
    nextSetBtn.disabled = true
    finishMatchBtn.disabled = true

    try {
        showMessage('⏳ Сохранение...', 'success')

        await apiPut(`/events/${eventId}/matches/${matchId}`, {
            setsTeam1: team1Sets,
            setsTeam2: team2Sets,
            winnerId,
            sets: currentSets.map(s => ({
                team1: s.team1,
                team2: s.team2,
                winner: s.winner
            }))
        })

        showMessage(`✅ Результат сохранён! ${team1Sets}:${team2Sets}`, 'success')

        resetBtn.disabled = true
        nextSetBtn.disabled = true
        finishMatchBtn.disabled = true

        setTimeout(() => window.location.reload(), 1500)

    } catch (error) {
        showMessage(error.message || 'Ошибка сети', 'error')

        resetBtn.disabled = false
        nextSetBtn.disabled = false
        finishMatchBtn.disabled = false

        updateButtonsState()
    }
}

function updateButtonsState() {
    const set = currentSets[currentSetIndex]
    const matchSelect = document.getElementById('counter-match-select')
    const matchSelected = matchSelect && matchSelect.value !== ''

    const resetBtn = document.getElementById('btn-reset-score')
    const nextSetBtn = document.getElementById('btn-next-set')
    const finishMatchBtn = document.getElementById('btn-finish-match')

    if (resetBtn) {
        resetBtn.disabled = !matchSelected || !set || set.finished
    }

    if (nextSetBtn) {
        nextSetBtn.disabled = !matchSelected || !set || set.finished || currentSets.length >= MAX_SETS
    }

    if (finishMatchBtn) {
        const hasFinishedSets = currentSets.some(s => s.finished)
        finishMatchBtn.disabled = !matchSelected || !hasFinishedSets
    }
}


// ============================================================
// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ============================================================

function switchTab(tab) {
    document.querySelectorAll('.filterGroup button').forEach(b => b.classList.remove('buttonAccent'))
    document.getElementById(`tab-${tab}`)?.classList.add('buttonAccent')

    if (!contentContainer) return

    const sections = {
        counter: document.getElementById('section-counter'),
        groups: document.getElementById('section-groups'),
        bracket: document.getElementById('section-bracket')
    }

    let order
    if (tab === 'counter') order = [sections.counter, sections.groups, sections.bracket]
    else if (tab === 'bracket') order = [sections.bracket, sections.groups, sections.counter]
    else order = [sections.groups, sections.bracket, sections.counter]

    order.forEach(section => {
        if (section && contentContainer.contains(section)) contentContainer.appendChild(section)
    })

    // Переключение таблица/матчи внутри групп
    if (tab === 'standings' || tab === 'matches') {
        const groupSections = sections.groups?.querySelectorAll('.group-section') || []
        groupSections.forEach(groupSection => {
            const mainBoard = groupSection.querySelector('.mainBoard')
            if (!mainBoard) return

            const cards = mainBoard.querySelectorAll('.card')
            if (cards.length < 2) return

            let standingsCard = null, matchesCard = null
            cards.forEach(card => {
                const header = card.querySelector('.cardHeader h3')
                if (header) {
                    if (header.textContent.includes('Таблица')) standingsCard = card
                    if (header.textContent.includes('Матчи')) matchesCard = card
                }
            })

            if (tab === 'standings' && standingsCard) mainBoard.prepend(standingsCard)
            else if (tab === 'matches' && matchesCard) mainBoard.prepend(matchesCard)
        })
    }
}

// ============================================================
// ЗАВЕРШЕНИЕ ТУРНИРА
// ============================================================

async function finishTournament() {
    const eventId = new URLSearchParams(window.location.search).get('id')
    if (!eventId) return

    if (!confirm('⚠️ Удалить турнир? Это действие нельзя отменить.')) return
    if (!confirm('🔴 Подтвердите удаление турнира и всех данных.')) return

    try {
        const btn = document.getElementById('finish-tournament-btn')
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Удаление...' }

        await apiDelete(`/events/${eventId}/finish`)
        alert('✅ Турнир удалён!')
        window.location.href = 'tournaments.html'
    } catch (error) {
        alert(error.message || 'Ошибка')
        const btn = document.getElementById('finish-tournament-btn')
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-flag-checkered"></i> Завершить' }
    }
}

function isCreator() {
    return currentUser && tournament && tournament.creatorId === currentUser.userId
}

// Запуск
loadTournament()
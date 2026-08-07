import { checkAuth, updateUserCard } from './auth.js'
import { apiGet, apiPut } from './api.js'
import { BracketRenderer } from './bracketRenderer.js'
import { getTeamNameFromTeam, getGroupLetter, nextPowerOfTwo, compareTeamRating } from './utils.js'

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

    if (format === 'Король корта (каждый с каждым)' || 
        format === 'Олимпийская система (на вылет)' ||
        format === 'Двойное выбывание (Double Elimination)') {
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

        const bracketContainer = document.createElement('div')
        bracketContainer.id = 'bracket-interactive-container'
        container.appendChild(bracketContainer)

        interactiveBracket = new BracketRenderer({
            container: bracketContainer,
            teams,
            teamNames,
            interactive: true,
            onChange: (data) => { window.bracketData = data }
        })
        interactiveBracket.render()
        return
    }

    if (format === 'Двойное выбывание (Double Elimination)') {
        if (shuffleContainer) shuffleContainer.style.display = 'block'
        container.innerHTML = ''

        if (interactiveBracket) interactiveBracket.destroy()

        const teamNames = {}
        teams.forEach(t => { teamNames[t.teamId] = getTeamNameFromTeam(t) })

        // Единый контейнер для всей DE структуры
        const deWrapper = document.createElement('div')
        deWrapper.id = 'de-full-structure'
        deWrapper.style.cssText = 'display: flex; gap: 24px; overflow-x: auto; padding: 8px 0; align-items: flex-start;'
        container.appendChild(deWrapper)

        // Верхняя сетка (интерактивная) + нижняя + финал четырёх
        buildDEFullStructure(teams, teamNames)

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
// ПОСТРОЕНИЕ ПОЛНОЙ DE СТРУКТУРЫ
// ============================================================

function buildDEFullStructure(teamsList, teamNames) {
    const wrapper = document.getElementById('de-full-structure')
    if (!wrapper) return

    const totalSlots = nextPowerOfTwo(teamsList.length)
    const roundsW = Math.log2(totalSlots)
    const byeCount = totalSlots - teamsList.length

    const shuffled = [...teamsList]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const teamsForDE = shuffled.map((t) => ({ teamId: t.teamId, teamData: t }))
    const allMatches = generateDoubleElimination(teamsForDE, totalSlots)
    
    // Строим очередность раундов
    const roundOrder = buildRoundOrder(allMatches)
    
    const matchNumberMap = {}
    allMatches.forEach(m => {
        const key = `${m.bracket}-${m.stageLevel}-${m.matchIndex}`
        matchNumberMap[key] = m.matchId
    })

    wrapper.innerHTML = ''
    wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 32px; overflow-x: auto; padding: 8px 0;'

    const slots = []
    for (let i = 0; i < totalSlots; i++) {
        slots.push({ id: i, teamId: null, teamData: null, isBye: false })
    }

    const byeInTop = Math.ceil(byeCount / 2)
    const byeInBottom = byeCount - byeInTop
    const topByeSlots = []
    for (let i = 0; i < byeInTop; i++) topByeSlots.push(i * 2)
    const bottomByeSlots = []
    for (let i = 0; i < byeInBottom; i++) bottomByeSlots.push(totalSlots - 2 - i * 2)
    bottomByeSlots.sort((a, b) => a - b)
    const allByeSlots = [...topByeSlots, ...bottomByeSlots]

    for (let i = 0; i < byeCount; i++) {
        const slotIdx = allByeSlots[i]
        if (slotIdx < totalSlots && shuffled[i]) {
            slots[slotIdx].teamId = shuffled[i].teamId
            slots[slotIdx].teamData = shuffled[i]
            slots[slotIdx].isBye = true
            const neighbor = slotIdx % 2 === 0 ? slotIdx + 1 : slotIdx - 1
            if (neighbor < totalSlots && neighbor >= 0) slots[neighbor].isBye = true
        }
    }

    let teamIdx = byeCount
    for (let i = 0; i < totalSlots; i++) {
        if (!slots[i].teamId && !slots[i].isBye && teamIdx < shuffled.length) {
            slots[i].teamId = shuffled[teamIdx].teamId
            slots[i].teamData = shuffled[teamIdx]
            teamIdx++
        }
    }

    window.deSlots = slots
    window.deMatchNumberMap = matchNumberMap
    window.deTeams = shuffled
    window.deRoundOrder = roundOrder

    renderDEWinnersBracket(wrapper, slots, roundsW, matchNumberMap, teamNames, roundOrder)

    const losersSection = document.createElement('div')
    losersSection.id = 'de-losers-section'
    wrapper.appendChild(losersSection)

    buildDELosersAndFinalsFromMatches(allMatches, teamNames, matchNumberMap, roundOrder)
}

// Выделяем рендер верхней сетки в отдельную функцию для переиспользования
function buildRoundOrder(allMatches) {
    const winnersByStage = {}
    const losersByStage = {}
    
    allMatches.forEach(m => {
        if (m.bracket === 'winners') {
            if (!winnersByStage[m.stageLevel]) winnersByStage[m.stageLevel] = []
            winnersByStage[m.stageLevel].push(m)
        }
        if (m.bracket === 'losers') {
            if (!losersByStage[m.stageLevel]) losersByStage[m.stageLevel] = []
            losersByStage[m.stageLevel].push(m)
        }
    })
    
    const wStages = Object.keys(winnersByStage).map(Number).sort((a, b) => a - b)
    const lStages = Object.keys(losersByStage).map(Number).sort((a, b) => a - b)
    const maxWStage = Math.max(...wStages)
    
    const hasW2 = wStages.includes(2)
    const w1Count = (winnersByStage[1] || []).length
    const S = w1Count * 2
    const isStrategyB = hasW2 && (winnersByStage[2] || []).length === S / 4
    
    const roundOrder = []
    let roundNum = 1
    
    if (isStrategyB) {
        // Хронологический порядок: W1 → W2 → L1 → L2 → W3 → L3 → L4 → W4 → L5 → ...
        roundOrder.push({ bracket: 'winners', stage: 1, roundNumber: roundNum++ })
        roundOrder.push({ bracket: 'winners', stage: 2, roundNumber: roundNum++ })
        
        if (lStages.includes(1)) roundOrder.push({ bracket: 'losers', stage: 1, roundNumber: roundNum++ })
        if (lStages.includes(2)) roundOrder.push({ bracket: 'losers', stage: 2, roundNumber: roundNum++ })
        
        // Начиная с r=3: W(r), L(r), L(r+1), W(r+1), ...
        let r = 3
        while (r <= maxWStage + 2) {
            if (wStages.includes(r)) {
                roundOrder.push({ bracket: 'winners', stage: r, roundNumber: roundNum++ })
            }
            if (lStages.includes(r)) {
                roundOrder.push({ bracket: 'losers', stage: r, roundNumber: roundNum++ })
            }
            r++
        }
    } else {
        // Стратегия А
        for (let r = 1; r <= maxWStage + 2; r++) {
            if (wStages.includes(r)) {
                roundOrder.push({ bracket: 'winners', stage: r, roundNumber: roundNum++ })
            }
            if (lStages.includes(r)) {
                roundOrder.push({ bracket: 'losers', stage: r, roundNumber: roundNum++ })
            }
        }
    }
    
    return roundOrder
}

function getDERoundLabel(bracket, stage, roundOrder) {
    const entry = roundOrder.find(r => r.bracket === bracket && r.stage === stage)
    if (!entry) return `${bracket}${stage}`
    return `Раунд ${entry.roundNumber}`
}


// Обновлённый renderDEWinnersBracket
function renderDEWinnersBracket(wrapper, slots, roundsW, matchNumberMap, teamNames, roundOrder) {
    const existing = wrapper.querySelector('.de-winners-section')
    if (existing) existing.remove()

    const winnersSection = document.createElement('div')
    winnersSection.className = 'de-winners-section'

    const winnersTitle = document.createElement('div')
    winnersTitle.style.cssText = 'text-align: center; font-weight: 700; font-size: 1.1rem; color: #c49a2c; margin-bottom: 12px;'
    winnersTitle.textContent = 'Верхняя сетка'
    winnersSection.appendChild(winnersTitle)

    // Группируем раунды верхней сетки по stageLevel
    const wStages = [...new Set(roundOrder.filter(r => r.bracket === 'winners').map(r => r.stage))].sort((a, b) => a - b)
    
    const winnersGrid = document.createElement('div')
    winnersGrid.className = 'bracket-grid'
    winnersGrid.style.cssText = `display: grid; grid-template-columns: repeat(${wStages.length}, 1fr); gap: 16px;`
    winnersSection.appendChild(winnersGrid)

    wStages.forEach(stage => {
        const roundDiv = document.createElement('div')
        roundDiv.className = 'bracket-round'
        const roundLabel = document.createElement('div')
        roundLabel.className = `bracket-round-label ${stage === roundsW ? 'bracket-round-label-final' : ''}`
        roundLabel.textContent = getDERoundLabel('winners', stage, roundOrder)
        roundDiv.appendChild(roundLabel)

        const matchesDiv = document.createElement('div')
        matchesDiv.className = 'bracket-matches'

        // Собираем матчи этого раунда
        const matchIndices = []
        for (let m = 0; m < Math.pow(2, roundsW - stage); m++) {
            matchIndices.push(m)
        }

        matchIndices.forEach(m => {
            const matchNum = getDEMatchNum(matchNumberMap, 'winners', stage, m + 1)

            if (stage === 1) {
                const s1 = slots[m * 2]
                const s2 = slots[m * 2 + 1]
                if (s1 && s2) {
                    matchesDiv.appendChild(createDEInteractiveMatch(matchNum, s1, s2, m, teamNames))
                }
            } else {
                const prevMatch1Num = getDEMatchNum(matchNumberMap, 'winners', stage - 1, m * 2 + 1)
                const prevMatch2Num = getDEMatchNum(matchNumberMap, 'winners', stage - 1, m * 2 + 2)
                matchesDiv.appendChild(createDEStaticMatch(matchNum, `Поб. M${prevMatch1Num}`, `Поб. M${prevMatch2Num}`))
            }
        })

        roundDiv.appendChild(matchesDiv)
        winnersGrid.appendChild(roundDiv)
    })

    const losersSection = document.getElementById('de-losers-section')
    if (losersSection) {
        wrapper.insertBefore(winnersSection, losersSection)
    } else {
        wrapper.appendChild(winnersSection)
    }
}

// Получение номера матча из карты
function getDEMatchNum(map, bracket, stageLevel, matchIndex) {
    const key = `${bracket}-${stageLevel}-${matchIndex}`
    return map[key] || '?'
}

// Интерактивный матч первого раунда
function createDEInteractiveMatch(matchNum, slot1, slot2, matchIndex, teamNames) {
    const div = document.createElement('div')
    div.className = 'bracket-cell'

    const name1 = slot1.teamId && teamNames[slot1.teamId] ? teamNames[slot1.teamId] : (slot1.isBye ? 'BYE' : '')
    const name2 = slot2.teamId && teamNames[slot2.teamId] ? teamNames[slot2.teamId] : (slot2.isBye ? 'BYE' : '')

    div.innerHTML = `
        <div style="font-size: 0.6rem; color: #8e9aab; text-align: center; margin-bottom: 2px;">M${matchNum}</div>
        <div class="bracket-team ${slot1.isBye && !slot1.teamId ? 'bracket-team-bye' : ''} ${!slot1.teamId && !slot1.isBye ? 'bracket-team-placeholder' : ''}"
             draggable="${slot1.teamId ? 'true' : 'false'}"
             data-team-id="${slot1.teamId || ''}"
             data-slot-id="${slot1.id}">
            <span class="bracket-score"></span>
            <span class="bracket-team-name ${!slot1.teamId && !slot1.isBye ? 'bracket-team-name-placeholder' : ''}">${name1 || 'Команда'}</span>
        </div>
        <div class="bracket-vs">VS</div>
        <div class="bracket-team ${slot2.isBye && !slot2.teamId ? 'bracket-team-bye' : ''} ${!slot2.teamId && !slot2.isBye ? 'bracket-team-placeholder' : ''}"
             draggable="${slot2.teamId ? 'true' : 'false'}"
             data-team-id="${slot2.teamId || ''}"
             data-slot-id="${slot2.id}">
            <span class="bracket-score"></span>
            <span class="bracket-team-name ${!slot2.teamId && !slot2.isBye ? 'bracket-team-name-placeholder' : ''}">${name2 || 'Команда'}</span>
        </div>
    `
    return div
}

// Статический матч следующих раундов (подписи из реальных номеров матчей)
function createDEStaticMatch(matchNum, label1, label2) {
    const div = document.createElement('div')
    div.className = 'bracket-cell'

    div.innerHTML = `
        <div style="font-size: 0.6rem; color: #8e9aab; text-align: center; margin-bottom: 2px;">M${matchNum}</div>
        <div class="bracket-team bracket-team-placeholder">
            <span class="bracket-score"></span>
            <span class="bracket-team-name bracket-team-name-placeholder">${label1}</span>
        </div>
        <div class="bracket-vs">VS</div>
        <div class="bracket-team bracket-team-placeholder">
            <span class="bracket-score"></span>
            <span class="bracket-team-name bracket-team-name-placeholder">${label2}</span>
        </div>
    `
    return div
}

// Обновлённая нижняя сетка + финал четырёх из сгенерированных матчей
function buildDELosersAndFinalsFromMatches(allMatches, teamNames, matchNumberMap, roundOrder) {
    const section = document.getElementById('de-losers-section')
    if (!section) return

    const losersMatches = allMatches.filter(m => m.bracket === 'losers')
    const semifinals = allMatches.filter(m => m.bracket === 'semifinal')
    const thirdPlace = allMatches.filter(m => m.bracket === 'third_place')
    const final = allMatches.filter(m => m.bracket === 'final')

    section.innerHTML = ''

    const byStage = {}
    losersMatches.forEach(m => {
        const s = m.stageLevel || 0
        if (!byStage[s]) byStage[s] = []
        byStage[s].push(m)
    })

    const lStages = [...new Set(roundOrder.filter(r => r.bracket === 'losers').map(r => r.stage))].sort((a, b) => a - b)

    if (lStages.length > 0) {
        const losersTitle = document.createElement('div')
        losersTitle.style.cssText = 'text-align: center; font-weight: 700; font-size: 1.1rem; color: #8e9aab; margin-bottom: 12px;'
        losersTitle.textContent = 'Нижняя сетка'
        section.appendChild(losersTitle)

        const losersGrid = document.createElement('div')
        losersGrid.className = 'bracket-grid'
        losersGrid.style.cssText = `display: grid; grid-template-columns: repeat(${lStages.length}, 1fr); gap: 16px;`

        lStages.forEach(stage => {
            const roundDiv = document.createElement('div')
            roundDiv.className = 'bracket-round'

            const roundLabel = document.createElement('div')
            roundLabel.className = 'bracket-round-label'
            roundLabel.textContent = getDERoundLabel('losers', stage, roundOrder)
            roundDiv.appendChild(roundLabel)

            const matchesDiv = document.createElement('div')
            matchesDiv.className = 'bracket-matches'

            const stageMatches = (byStage[stage] || []).sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0))
            
            if (stage === 1) {
                const realMatches = stageMatches.filter(m => !m.isBye2 || m.team2Source !== 'bye')
                const byeMatches = stageMatches.filter(m => m.isBye2 && m.team2Source === 'bye')
                
                const orderedSlots = []
                let byeIdx = 0, realIdx = 0
                
                if (byeMatches.length > 0) orderedSlots.push({ type: 'bye', data: byeMatches[byeIdx++] })
                if (realMatches.length > 0) orderedSlots.push({ type: 'match', data: realMatches[realIdx++] })
                if (byeMatches.length > 1) orderedSlots.push({ type: 'bye', data: byeMatches[byeIdx++] })
                if (realMatches.length > 1) orderedSlots.push({ type: 'match', data: realMatches[realIdx++] })
                if (byeMatches.length > 2) orderedSlots.push({ type: 'bye', data: byeMatches[byeIdx++] })
                
                orderedSlots.forEach(slot => {
                    if (slot.type === 'match') {
                        matchesDiv.appendChild(createMatchPreview(slot.data, teamNames, matchNumberMap))
                    } else {
                        matchesDiv.appendChild(createDEByeSlot(slot.data, teamNames, matchNumberMap))
                    }
                })
            } else {
                stageMatches.forEach(match => {
                    matchesDiv.appendChild(createMatchPreview(match, teamNames, matchNumberMap))
                })
            }

            roundDiv.appendChild(matchesDiv)
            losersGrid.appendChild(roundDiv)
        })

        section.appendChild(losersGrid)
    }

       // Финал четырёх — в стиле остальных сеток
    if (semifinals.length > 0 || thirdPlace.length > 0 || final.length > 0) {
        const finalFourTitle = document.createElement('div')
        finalFourTitle.style.cssText = 'text-align: center; font-weight: 700; font-size: 1.1rem; color: #c49a2c; margin: 16px 0 8px;'
        finalFourTitle.textContent = 'Финал четырёх'
        section.appendChild(finalFourTitle)

        const finalGrid = document.createElement('div')
        finalGrid.className = 'bracket-grid'
        finalGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;'

        // Колонка 1: Полуфиналы
        const semiRound = document.createElement('div')
        semiRound.className = 'bracket-round'
        
        const semiLabel = document.createElement('div')
        semiLabel.className = 'bracket-round-label'
        semiLabel.textContent = 'Полуфиналы'
        semiRound.appendChild(semiLabel)
        
        const semiMatches = document.createElement('div')
        semiMatches.className = 'bracket-matches'
        semifinals.sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0)).forEach(m => {
            semiMatches.appendChild(createMatchPreview(m, teamNames, matchNumberMap))
        })
        semiRound.appendChild(semiMatches)
        finalGrid.appendChild(semiRound)

        // Колонка 2: За 3-4 место
        const thirdRound = document.createElement('div')
        thirdRound.className = 'bracket-round'
        
        const thirdLabel = document.createElement('div')
        thirdLabel.className = 'bracket-round-label'
        thirdLabel.textContent = 'За 3-4 место'
        thirdRound.appendChild(thirdLabel)
        
        const thirdMatches = document.createElement('div')
        thirdMatches.className = 'bracket-matches'
        if (thirdPlace.length > 0) {
            thirdPlace.forEach(m => thirdMatches.appendChild(createMatchPreview(m, teamNames, matchNumberMap)))
        }
        thirdRound.appendChild(thirdMatches)
        finalGrid.appendChild(thirdRound)

        // Колонка 3: Финал
        const finalRound = document.createElement('div')
        finalRound.className = 'bracket-round'
        
        const finalLabel = document.createElement('div')
        finalLabel.className = 'bracket-round-label bracket-round-label-final'
        finalLabel.textContent = '🏆 Финал'
        finalRound.appendChild(finalLabel)
        
        const finalMatches = document.createElement('div')
        finalMatches.className = 'bracket-matches'
        if (final.length > 0) {
            final.forEach(m => finalMatches.appendChild(createMatchPreview(m, teamNames, matchNumberMap)))
        }
        finalRound.appendChild(finalMatches)
        finalGrid.appendChild(finalRound)
        
        section.appendChild(finalGrid)
    }
}

// BYE-слот в нижней сетке
function createDEByeSlot(match, teamNames, matchNumberMap) {
    const div = document.createElement('div')
    div.className = 'bracket-cell'
    
    const matchNum = match.matchId || '?'
    const loserLabel = match.team1SourceMatchId ? `Проиг. M${match.team1SourceMatchId}` : '???'

    div.innerHTML = `
        <div style="font-size: 0.6rem; color: #8e9aab; text-align: center; margin-bottom: 2px;">M${matchNum}</div>
        <div class="bracket-team bracket-team-placeholder">
            <span class="bracket-score"></span>
            <span class="bracket-team-name bracket-team-name-placeholder">${loserLabel}</span>
        </div>
        <div class="bracket-vs">VS</div>
        <div class="bracket-team bracket-team-bye">
            <span class="bracket-score"></span>
            <span class="bracket-team-name">BYE</span>
        </div>
    `
    return div
}

// Обновлённый createMatchPreview с учётом matchNumberMap
function createMatchPreview(match, teamNames, matchNumberMap) {
    const div = document.createElement('div')
    div.className = 'bracket-cell'
    div.style.cssText = 'margin-bottom: 4px;'

    const matchNum = match.matchId || match.dbMatchId || '?'

    const getSlotName = (teamId, source, sourceMatchId) => {
        if (teamId && teamNames[teamId]) return teamNames[teamId]
        if (source === 'team') return 'Команда'
        if (source === 'bye') return 'BYE'
        if (source === 'winner') return `Поб. M${sourceMatchId || '?'}`
        if (source === 'loser') return `Проиг. M${sourceMatchId || '?'}`
        return '???'
    }

    const name1 = getSlotName(match.team1Id, match.team1Source, match.team1SourceMatchId)
    const name2 = getSlotName(match.team2Id, match.team2Source, match.team2SourceMatchId)

    const isBye1 = match.isBye1 || (match.team1Source === 'bye')
    const isBye2 = match.isBye2 || (match.team2Source === 'bye')

    div.innerHTML = `
        <div style="font-size: 0.6rem; color: #8e9aab; text-align: center; margin-bottom: 2px;">M${matchNum}</div>
        <div class="bracket-team ${isBye1 ? 'bracket-team-bye' : ''} ${!match.team1Id && !isBye1 ? 'bracket-team-placeholder' : ''}">
            <span class="bracket-score"></span>
            <span class="bracket-team-name ${!match.team1Id && !isBye1 ? 'bracket-team-name-placeholder' : ''}">${name1}</span>
        </div>
        <div class="bracket-vs">VS</div>
        <div class="bracket-team ${isBye2 ? 'bracket-team-bye' : ''} ${!match.team2Id && !isBye2 ? 'bracket-team-placeholder' : ''}">
            <span class="bracket-score"></span>
            <span class="bracket-team-name ${!match.team2Id && !isBye2 ? 'bracket-team-name-placeholder' : ''}">${name2}</span>
        </div>
    `
    return div
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
    } else if (format === 'Двойное выбывание (Double Elimination)') {
        const currentTeams = window.deTeams || teams
        const shuffled = [...currentTeams]
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }

        const teamNames = {}
        teams.forEach(t => { teamNames[t.teamId] = getTeamNameFromTeam(t) })

        const wrapper = document.getElementById('de-full-structure')
        const totalSlots = nextPowerOfTwo(shuffled.length)
        const roundsW = Math.log2(totalSlots)
        const byeCount = totalSlots - shuffled.length

        const teamsForDE = shuffled.map((t) => ({ teamId: t.teamId, teamData: t }))
        const allMatches = generateDoubleElimination(teamsForDE, totalSlots)
        
        // Строим очередность раундов
        const roundOrder = buildRoundOrder(allMatches)
        window.deRoundOrder = roundOrder
        
        const matchNumberMap = {}
        allMatches.forEach(m => {
            const key = `${m.bracket}-${m.stageLevel}-${m.matchIndex}`
            matchNumberMap[key] = m.matchId
        })

        const slots = []
        for (let i = 0; i < totalSlots; i++) {
            slots.push({ id: i, teamId: null, teamData: null, isBye: false })
        }

        const byeInTop = Math.ceil(byeCount / 2)
        const byeInBottom = byeCount - byeInTop
        const topByeSlots = []
        for (let i = 0; i < byeInTop; i++) topByeSlots.push(i * 2)
        const bottomByeSlots = []
        for (let i = 0; i < byeInBottom; i++) bottomByeSlots.push(totalSlots - 2 - i * 2)
        bottomByeSlots.sort((a, b) => a - b)
        const allByeSlots = [...topByeSlots, ...bottomByeSlots]

        for (let i = 0; i < byeCount; i++) {
            const slotIdx = allByeSlots[i]
            if (slotIdx < totalSlots && shuffled[i]) {
                slots[slotIdx].teamId = shuffled[i].teamId
                slots[slotIdx].teamData = shuffled[i]
                slots[slotIdx].isBye = true
                const neighbor = slotIdx % 2 === 0 ? slotIdx + 1 : slotIdx - 1
                if (neighbor < totalSlots && neighbor >= 0) slots[neighbor].isBye = true
            }
        }

        let teamIdx = byeCount
        for (let i = 0; i < totalSlots; i++) {
            if (!slots[i].teamId && !slots[i].isBye && teamIdx < shuffled.length) {
                slots[i].teamId = shuffled[teamIdx].teamId
                slots[i].teamData = shuffled[teamIdx]
                teamIdx++
            }
        }

        window.deSlots = slots
        window.deMatchNumberMap = matchNumberMap
        window.deTeams = shuffled

        // Перестраиваем верхнюю сетку с roundOrder
        renderDEWinnersBracket(wrapper, slots, roundsW, matchNumberMap, teamNames, roundOrder)
        
        // Перестраиваем нижнюю сетку с roundOrder
        buildDELosersAndFinalsFromMatches(allMatches, teamNames, matchNumberMap, roundOrder)
        
        window.bracketData = { slots: slots.filter(s => s.teamId).map(s => ({ teamId: s.teamId })) }
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

    if (format === 'Олимпийская система (на вылет)' || format === 'Двойное выбывание (Double Elimination)') {
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

// ===== ИСПРАВЛЕНИЕ в функции отправки формы =====
document.getElementById('start-tournament-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    const eventId = document.getElementById('event-id').value
    const formData = new FormData(e.target)
    const data = Object.fromEntries(formData)

    if (tournament.tournamentFormat === 'Олимпийская система (на вылет)') {
        delete data.groupCount
        delete data.advanceCount
        
        if (interactiveBracket) {
            const bracketData = interactiveBracket.getData()
            data.bracket = bracketData.matches
        }
    } else if (tournament.tournamentFormat === 'Двойное выбывание (Double Elimination)') {
        delete data.groupCount
        delete data.advanceCount
        
        const shuffled = [...teams]
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        
        const teamsForDE = shuffled.map(t => ({ teamId: t.teamId, teamData: t }))
        const totalSlots = nextPowerOfTwo(teams.length)
        const bracketMatches = generateDoubleElimination(teamsForDE, totalSlots)
        
        console.log('Bracket sample:', bracketMatches.slice(0, 5).map(m => ({
            matchId: m.matchId,
            bracket: m.bracket,
            stageLevel: m.stageLevel,
            matchIndex: m.matchIndex,
            nextMatchId: m.nextMatchId,
            nextMatchSlot: m.nextMatchSlot,
            loserMatchId: m.loserMatchId,
            loserMatchSlot: m.loserMatchSlot
        })))
        
        data.bracket = bracketMatches
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

// ============================================================
// DOUBLE ELIMINATION GENERATOR
// ============================================================

function generateDoubleElimination(teams, totalSlots) {
    const N = teams.length
    const S = totalSlots
    const B = S - N
    const roundsW = Math.log2(S)
    
    const wMatches = {}
    const lMatches = {}
    const allMatches = []
    let nextInternalId = 1
    
    let realW1MatchIndices = []
    
    if (B === 0) {
        // ============================================================
        // СТРАТЕГИЯ А: ЧИСТАЯ СТЕПЕНЬ ДВОЙКИ
        // ============================================================
        
        for (let i = 0; i < S / 2; i++) {
            const t1 = teams[i * 2], t2 = teams[i * 2 + 1]
            const m = {
                _id: nextInternalId,
                bracket: 'winners', stageLevel: 1, matchIndex: i + 1,
                team1Id: t1?.teamId || null, team2Id: t2?.teamId || null,
                team1Source: 'team', team2Source: 'team',
                team1SourceMatchId: null, team2SourceMatchId: null,
                nextMatchId: null, nextMatchSlot: null,
                loserMatchId: null, loserMatchSlot: null,
                isBye1: false, isBye2: false
            }
            allMatches.push(m)
            if (!wMatches[1]) wMatches[1] = []
            wMatches[1].push(m._id)
            realW1MatchIndices.push(i + 1)
            nextInternalId++
        }

        for (let r = 2; r <= roundsW - 1; r++) {
            const cnt = S / Math.pow(2, r)
            for (let i = 0; i < cnt; i++) {
                const m = {
                    _id: nextInternalId,
                    bracket: 'winners', stageLevel: r, matchIndex: i + 1,
                    team1Id: null, team2Id: null,
                    team1Source: 'winner', team2Source: 'winner',
                    team1SourceMatchId: wMatches[r-1][i*2],
                    team2SourceMatchId: wMatches[r-1][i*2+1],
                    nextMatchId: null, nextMatchSlot: null,
                    loserMatchId: null, loserMatchSlot: null,
                    isBye1: false, isBye2: false
                }
                allMatches.push(m)
                if (!wMatches[r]) wMatches[r] = []
                wMatches[r].push(m._id)
                nextInternalId++
            }
        }

        const l1Count = wMatches[1].length / 2
        for (let i = 0; i < l1Count; i++) {
            const m = {
                _id: nextInternalId,
                bracket: 'losers', stageLevel: 1, matchIndex: i + 1,
                team1Id: null, team2Id: null,
                team1Source: 'loser', team2Source: 'loser',
                team1SourceMatchId: wMatches[1][i*2],
                team2SourceMatchId: wMatches[1][i*2+1],
                nextMatchId: null, nextMatchSlot: null,
                loserMatchId: null, loserMatchSlot: null,
                isBye1: false, isBye2: false
            }
            allMatches.push(m)
            if (!lMatches[1]) lMatches[1] = []
            lMatches[1].push(m._id)
            nextInternalId++
        }

        for (let i = 0; i < wMatches[1].length; i++) {
            const wMatch = findMatch(allMatches, wMatches[1][i])
            if (wMatch) {
                wMatch.loserMatchId = lMatches[1][Math.floor(i / 2)]
                wMatch.loserMatchSlot = (i % 2 === 0) ? 'team1' : 'team2'
            }
        }

        let r = 2
        while (r <= roundsW - 1) {
            const prevL = lMatches[r-1] || []
            if (prevL.length === 0) break
            
            const wNext = wMatches[r+1] || []
            const bigCount = Math.min(prevL.length, wNext.length)
            
            if (bigCount > 0) {
                if (!lMatches[r]) lMatches[r] = []
                
                const halfBig = Math.floor(bigCount / 2)
                
                for (let i = 0; i < halfBig; i++) {
                    const wbIdx = wNext.length - 1 - i
                    const m = {
                        _id: nextInternalId,
                        bracket: 'losers', stageLevel: r, matchIndex: i + 1,
                        team1Id: null, team2Id: null,
                        team1Source: 'winner', team2Source: 'loser',
                        team1SourceMatchId: prevL[i],
                        team2SourceMatchId: wNext[wbIdx],
                        nextMatchId: null, nextMatchSlot: null,
                        loserMatchId: null, loserMatchSlot: null,
                        isBye1: false, isBye2: false
                    }
                    allMatches.push(m)
                    lMatches[r].push(m._id)
                    nextInternalId++
                }
                
                for (let i = halfBig; i < bigCount; i++) {
                    const wbIdx = i - halfBig
                    const m = {
                        _id: nextInternalId,
                        bracket: 'losers', stageLevel: r, matchIndex: i + 1,
                        team1Id: null, team2Id: null,
                        team1Source: 'winner', team2Source: 'loser',
                        team1SourceMatchId: prevL[i],
                        team2SourceMatchId: wNext[wbIdx],
                        nextMatchId: null, nextMatchSlot: null,
                        loserMatchId: null, loserMatchSlot: null,
                        isBye1: false, isBye2: false
                    }
                    allMatches.push(m)
                    lMatches[r].push(m._id)
                    nextInternalId++
                }
            }
            
            if ((lMatches[r] || []).length === 0) break
            
            const bigRound = lMatches[r] || []
            const smallCount = Math.floor(bigRound.length / 2)
            
            if (smallCount > 0) {
                const smallR = r + 1
                if (!lMatches[smallR]) lMatches[smallR] = []
                
                for (let i = 0; i < smallCount; i++) {
                    const m = {
                        _id: nextInternalId,
                        bracket: 'losers', stageLevel: smallR, matchIndex: i + 1,
                        team1Id: null, team2Id: null,
                        team1Source: 'winner', team2Source: 'winner',
                        team1SourceMatchId: bigRound[i*2],
                        team2SourceMatchId: bigRound[i*2+1],
                        nextMatchId: null, nextMatchSlot: null,
                        loserMatchId: null, loserMatchSlot: null,
                        isBye1: false, isBye2: false
                    }
                    allMatches.push(m)
                    lMatches[smallR].push(m._id)
                    nextInternalId++
                }
            }
            
            r += 2
        }

        for (let wr = 2; wr <= roundsW - 1; wr++) {
            const wRound = wMatches[wr] || []
            const lRound = lMatches[wr-1] || []
            
            for (const wId of wRound) {
                const wMatch = findMatch(allMatches, wId)
                if (!wMatch) continue
                for (const lId of lRound) {
                    const lMatch = findMatch(allMatches, lId)
                    if (lMatch && lMatch.team2SourceMatchId === wMatch._id) {
                        wMatch.loserMatchId = lMatch._id
                        wMatch.loserMatchSlot = 'team2'
                        break
                    }
                }
            }
        }

    } else {
        // ============================================================
        // СТРАТЕГИЯ Б: ЕСТЬ BYE
        // ============================================================
        
        const realMatchesW1 = N - S/2
        const byeCountW1 = S/2 - realMatchesW1

        const topByes = Math.ceil(byeCountW1 / 2)
        const bottomByes = byeCountW1 - topByes
        
        const w1Slots = new Array(S/2).fill(1)
        for (let i = 0; i < topByes; i++) w1Slots[i] = 0
        for (let i = 0; i < bottomByes; i++) w1Slots[S/2 - 1 - i] = 0

        const shuffled = [...teams]
        let ti = 0
        
        for (let slot = 0; slot < S/2; slot++) {
            if (w1Slots[slot] === 1) {
                const t1 = shuffled[ti++], t2 = shuffled[ti++]
                const m = {
                    _id: nextInternalId,
                    bracket: 'winners', stageLevel: 1, matchIndex: slot + 1,
                    team1Id: t1?.teamId || null, team2Id: t2?.teamId || null,
                    team1Source: 'team', team2Source: 'team',
                    team1SourceMatchId: null, team2SourceMatchId: null,
                    nextMatchId: null, nextMatchSlot: null,
                    loserMatchId: null, loserMatchSlot: null,
                    isBye1: false, isBye2: false
                }
                allMatches.push(m)
                if (!wMatches[1]) wMatches[1] = []
                wMatches[1].push(m._id)
                realW1MatchIndices.push(slot + 1)
                nextInternalId++
            } else {
                const t = shuffled[ti++]
                const m = {
                    _id: nextInternalId,
                    bracket: 'winners', stageLevel: 1, matchIndex: slot + 1,
                    team1Id: t?.teamId || null, team2Id: null,
                    team1Source: 'team', team2Source: 'bye',
                    team1SourceMatchId: null, team2SourceMatchId: null,
                    nextMatchId: null, nextMatchSlot: null,
                    loserMatchId: null, loserMatchSlot: null,
                    isBye1: false, isBye2: true
                }
                allMatches.push(m)
                if (!wMatches[1]) wMatches[1] = []
                wMatches[1].push(m._id)
                nextInternalId++
            }
        }

        for (let i = 0; i < S/4; i++) {
            const m = {
                _id: nextInternalId,
                bracket: 'winners', stageLevel: 2, matchIndex: i + 1,
                team1Id: null, team2Id: null,
                team1Source: 'winner', team2Source: 'winner',
                team1SourceMatchId: wMatches[1][i*2],
                team2SourceMatchId: wMatches[1][i*2+1],
                nextMatchId: null, nextMatchSlot: null,
                loserMatchId: null, loserMatchSlot: null,
                isBye1: false, isBye2: false
            }
            allMatches.push(m)
            if (!wMatches[2]) wMatches[2] = []
            wMatches[2].push(m._id)
            nextInternalId++
        }

        for (let r = 3; r <= roundsW - 1; r++) {
            const cnt = S / Math.pow(2, r)
            for (let i = 0; i < cnt; i++) {
                const m = {
                    _id: nextInternalId,
                    bracket: 'winners', stageLevel: r, matchIndex: i + 1,
                    team1Id: null, team2Id: null,
                    team1Source: 'winner', team2Source: 'winner',
                    team1SourceMatchId: wMatches[r-1][i*2],
                    team2SourceMatchId: wMatches[r-1][i*2+1],
                    nextMatchId: null, nextMatchSlot: null,
                    loserMatchId: null, loserMatchSlot: null,
                    isBye1: false, isBye2: false
                }
                allMatches.push(m)
                if (!wMatches[r]) wMatches[r] = []
                wMatches[r].push(m._id)
                nextInternalId++
            }
        }

        // НАКОПЛЕНИЕ: L1
        const realW1Ids = wMatches[1].filter((id, idx) => w1Slots[idx] === 1)
        const losersW1Count = realMatchesW1
        const losersW2Count = S/4
        const totalLosers = losersW1Count + losersW2Count
        const L1Slots = Math.pow(2, Math.ceil(Math.log2(totalLosers)))
        const half = L1Slots / 2
        
        const slots = new Array(L1Slots).fill(null)
        
        const w2Top = Math.floor(losersW2Count / 2)
        const w2Bot = losersW2Count - w2Top
        
        for (let i = 0; i < w2Top; i++) {
            slots[half - w2Top + i] = { source: 'loser', sourceMatchId: wMatches[2][i], fromW2: true }
        }
        for (let i = 0; i < w2Bot; i++) {
            slots[L1Slots - w2Bot + i] = { source: 'loser', sourceMatchId: wMatches[2][w2Top + i], fromW2: true }
        }
        
        const w1Top = Math.ceil(losersW1Count / 2)
        const w1Bot = losersW1Count - w1Top
        
        for (let i = 0; i < w1Top; i++) {
            if (i < realW1Ids.length) {
                slots[i] = { source: 'loser', sourceMatchId: realW1Ids[i], fromW1: true, w1MatchIndex: realW1MatchIndices[i] }
            }
        }
        for (let i = 0; i < w1Bot; i++) {
            if (w1Top + i < realW1Ids.length) {
                slots[half + i] = { source: 'loser', sourceMatchId: realW1Ids[w1Top + i], fromW1: true, w1MatchIndex: realW1MatchIndices[w1Top + i] }
            }
        }
        
        for (let i = 0; i < L1Slots / 2; i++) {
            const s1 = slots[i*2], s2 = slots[i*2+1]
            const bye1 = s1 === null, bye2 = s2 === null
            
            const m = {
                _id: nextInternalId,
                bracket: 'losers', stageLevel: 1, matchIndex: i + 1,
                team1Id: null, team2Id: null,
                team1Source: bye1 ? 'bye' : 'loser', team2Source: bye2 ? 'bye' : 'loser',
                team1SourceMatchId: bye1 ? null : s1.sourceMatchId,
                team2SourceMatchId: bye2 ? null : s2.sourceMatchId,
                nextMatchId: null, nextMatchSlot: null,
                loserMatchId: null, loserMatchSlot: null,
                isBye1: bye1, isBye2: bye2
            }
            allMatches.push(m)
            if (!lMatches[1]) lMatches[1] = []
            lMatches[1].push(m._id)
            nextInternalId++
        }
        
        for (let i = 0; i < realW1Ids.length; i++) {
            const wMatch = findMatch(allMatches, realW1Ids[i])
            if (wMatch) {
                for (let si = 0; si < slots.length; si++) {
                    if (slots[si] && slots[si].sourceMatchId === realW1Ids[i]) {
                        wMatch.loserMatchId = lMatches[1][Math.floor(si / 2)]
                        wMatch.loserMatchSlot = (si % 2 === 0) ? 'team1' : 'team2'
                        break
                    }
                }
            }
        }
        
        for (let i = 0; i < losersW2Count; i++) {
            const wMatch = findMatch(allMatches, wMatches[2][i])
            if (wMatch) {
                for (let si = 0; si < slots.length; si++) {
                    if (slots[si] && slots[si].sourceMatchId === wMatches[2][i]) {
                        wMatch.loserMatchId = lMatches[1][Math.floor(si / 2)]
                        wMatch.loserMatchSlot = (si % 2 === 0) ? 'team1' : 'team2'
                        break
                    }
                }
            }
        }
        
        const L2Count = L1Slots / 4
        for (let i = 0; i < L2Count; i++) {
            const m = {
                _id: nextInternalId,
                bracket: 'losers', stageLevel: 2, matchIndex: i + 1,
                team1Id: null, team2Id: null,
                team1Source: 'winner', team2Source: 'winner',
                team1SourceMatchId: lMatches[1][i*2],
                team2SourceMatchId: lMatches[1][i*2+1],
                nextMatchId: null, nextMatchSlot: null,
                loserMatchId: null, loserMatchSlot: null,
                isBye1: false, isBye2: false
            }
            allMatches.push(m)
            if (!lMatches[2]) lMatches[2] = []
            lMatches[2].push(m._id)
            nextInternalId++
        }

        let r = 3
        while (r <= roundsW) {
            const prevL = lMatches[r-1] || []
            if (prevL.length === 0) break
            
            const wNext = wMatches[r] || []
            const bigCount = Math.min(prevL.length, wNext.length)
            
            if (bigCount > 0) {
                if (!lMatches[r]) lMatches[r] = []
                
                const halfBig = Math.floor(bigCount / 2)
                
                for (let i = 0; i < halfBig; i++) {
                    const wbIdx = wNext.length - 1 - i
                    const m = {
                        _id: nextInternalId,
                        bracket: 'losers', stageLevel: r, matchIndex: i + 1,
                        team1Id: null, team2Id: null,
                        team1Source: 'winner', team2Source: 'loser',
                        team1SourceMatchId: prevL[i],
                        team2SourceMatchId: wNext[wbIdx],
                        nextMatchId: null, nextMatchSlot: null,
                        loserMatchId: null, loserMatchSlot: null,
                        isBye1: false, isBye2: false
                    }
                    allMatches.push(m)
                    lMatches[r].push(m._id)
                    nextInternalId++
                }
                
                for (let i = halfBig; i < bigCount; i++) {
                    const wbIdx = i - halfBig
                    const m = {
                        _id: nextInternalId,
                        bracket: 'losers', stageLevel: r, matchIndex: i + 1,
                        team1Id: null, team2Id: null,
                        team1Source: 'winner', team2Source: 'loser',
                        team1SourceMatchId: prevL[i],
                        team2SourceMatchId: wNext[wbIdx],
                        nextMatchId: null, nextMatchSlot: null,
                        loserMatchId: null, loserMatchSlot: null,
                        isBye1: false, isBye2: false
                    }
                    allMatches.push(m)
                    lMatches[r].push(m._id)
                    nextInternalId++
                }
            }
            
            if ((lMatches[r] || []).length === 0) { r += 2; continue }
            
            const bigRound = lMatches[r] || []
            const smallCount = Math.floor(bigRound.length / 2)
            const nextW = wMatches[r + 2] || []
            const willHaveNextBig = nextW.length > 0 && smallCount > 0
            
            if (smallCount > 0 && willHaveNextBig) {
                const smallR = r + 1
                if (!lMatches[smallR]) lMatches[smallR] = []
                
                for (let i = 0; i < smallCount; i++) {
                    const m = {
                        _id: nextInternalId,
                        bracket: 'losers', stageLevel: smallR, matchIndex: i + 1,
                        team1Id: null, team2Id: null,
                        team1Source: 'winner', team2Source: 'winner',
                        team1SourceMatchId: bigRound[i*2],
                        team2SourceMatchId: bigRound[i*2+1],
                        nextMatchId: null, nextMatchSlot: null,
                        loserMatchId: null, loserMatchSlot: null,
                        isBye1: false, isBye2: false
                    }
                    allMatches.push(m)
                    lMatches[smallR].push(m._id)
                    nextInternalId++
                }
            }
            
            r += 2
        }

        for (let wr = 3; wr <= roundsW - 1; wr++) {
            const wRound = wMatches[wr] || []
            const lRound = lMatches[wr] || []
            
            for (const wId of wRound) {
                const wMatch = findMatch(allMatches, wId)
                if (!wMatch) continue
                for (const lId of lRound) {
                    const lMatch = findMatch(allMatches, lId)
                    if (lMatch && lMatch.team2SourceMatchId === wMatch._id) {
                        wMatch.loserMatchId = lMatch._id
                        wMatch.loserMatchSlot = 'team2'
                        break
                    }
                }
            }
        }
    }

    // ============================================================
    // СВЯЗИ nextMatchId ДЛЯ ВЕРХНЕЙ СЕТКИ
    // ============================================================
    for (let r = 1; r < roundsW; r++) {
        const wRound = wMatches[r] || []
        const wNext = wMatches[r+1] || []
        for (let i = 0; i < wRound.length; i++) {
            const m = findMatch(allMatches, wRound[i])
            if (m) {
                m.nextMatchId = wNext[Math.floor(i / 2)] || null
                m.nextMatchSlot = (i % 2 === 0) ? 'team1' : 'team2'
            }
        }
    }

    // СВЯЗИ ДЛЯ НИЖНЕЙ СЕТКИ — на основе подсказок
    const allLMatches = allMatches.filter(m => m.bracket === 'losers')
    
    allLMatches.forEach(lMatch => {
        const smallChild = allLMatches.find(m => 
            m._id !== lMatch._id &&
            (m.team1SourceMatchId === lMatch._id || m.team2SourceMatchId === lMatch._id) &&
            m.team1Source === 'winner' && m.team2Source === 'winner'
        )
        const bigChild = allLMatches.find(m => 
            m._id !== lMatch._id &&
            (m.team1SourceMatchId === lMatch._id || m.team2SourceMatchId === lMatch._id) &&
            m.team1Source === 'winner' && m.team2Source === 'loser'
        )
        
        if (smallChild) {
            lMatch.nextMatchId = smallChild._id
            lMatch.nextMatchSlot = smallChild.team1SourceMatchId === lMatch._id ? 'team1' : 'team2'
        } else if (bigChild) {
            lMatch.nextMatchId = bigChild._id
            lMatch.nextMatchSlot = bigChild.team1SourceMatchId === lMatch._id ? 'team1' : 'team2'
        }
    })
    
    const allWMatches = allMatches.filter(m => m.bracket === 'winners')
    allWMatches.forEach(wMatch => {
        if (wMatch.loserMatchId) return
        const lMatch = allLMatches.find(m => 
            m.team2Source === 'loser' && m.team2SourceMatchId === wMatch._id
        )
        if (lMatch) {
            wMatch.loserMatchId = lMatch._id
            wMatch.loserMatchSlot = 'team2'
        }
    })

    // ПОЛУФИНАЛЫ WB
    let wbTeam1MatchId = null, wbTeam2MatchId = null
    const wKeys = Object.keys(wMatches).map(Number).sort((a, b) => b - a)
    for (const key of wKeys) {
        const roundMatches = wMatches[key] || []
        if (roundMatches.length >= 2) {
            wbTeam1MatchId = roundMatches[0]; wbTeam2MatchId = roundMatches[1]; break
        } else if (roundMatches.length === 1) {
            wbTeam1MatchId = roundMatches[0]
            const prevMatches = wMatches[key - 1] || []
            if (prevMatches.length >= 1) wbTeam2MatchId = prevMatches[prevMatches.length - 1]
            break
        }
    }

    // ФИНАЛИСТЫ LB
    const lFinalKeys = Object.keys(lMatches).map(Number).sort((a, b) => b - a)
    let lbTeam1MatchId = null, lbTeam2MatchId = null
    
    for (const key of lFinalKeys) {
        const roundMatches = lMatches[key] || []
        const realMatches = roundMatches.filter(mid => {
            const m = findMatch(allMatches, mid)
            return m && !m.isBye1 && !m.isBye2
        })
        
        if (realMatches.length >= 2) {
            lbTeam1MatchId = realMatches[0]; lbTeam2MatchId = realMatches[1]; break
        } else if (realMatches.length === 1) {
            lbTeam1MatchId = realMatches[0]
            const prevMatches = lMatches[key - 1] || []
            const prevReal = prevMatches.filter(mid => {
                const m = findMatch(allMatches, mid)
                return m && !m.isBye1 && !m.isBye2
            })
            if (prevReal.length >= 1) lbTeam2MatchId = prevReal[prevReal.length - 1]
            break
        }
    }

    // ГРАНД-ФИНАЛ
    if (wbTeam1MatchId && wbTeam2MatchId && lbTeam1MatchId && lbTeam2MatchId) {
        const sf1 = {
            _id: nextInternalId, bracket: 'semifinal', stageLevel: 0, matchIndex: 1,
            team1Id: null, team2Id: null, team1Source: 'winner', team2Source: 'winner',
            team1SourceMatchId: wbTeam1MatchId, team2SourceMatchId: lbTeam2MatchId,
            nextMatchId: null, nextMatchSlot: null, loserMatchId: null, loserMatchSlot: null,
            isBye1: false, isBye2: false
        }
        allMatches.push(sf1); nextInternalId++
        
        const sf2 = {
            _id: nextInternalId, bracket: 'semifinal', stageLevel: 0, matchIndex: 2,
            team1Id: null, team2Id: null, team1Source: 'winner', team2Source: 'winner',
            team1SourceMatchId: wbTeam2MatchId, team2SourceMatchId: lbTeam1MatchId,
            nextMatchId: null, nextMatchSlot: null, loserMatchId: null, loserMatchSlot: null,
            isBye1: false, isBye2: false
        }
        allMatches.push(sf2); nextInternalId++
        
        const tp = {
            _id: nextInternalId, bracket: 'third_place', stageLevel: 0, matchIndex: 1,
            team1Id: null, team2Id: null, team1Source: 'loser', team2Source: 'loser',
            team1SourceMatchId: sf1._id, team2SourceMatchId: sf2._id,
            nextMatchId: null, nextMatchSlot: null, loserMatchId: null, loserMatchSlot: null,
            isBye1: false, isBye2: false
        }
        allMatches.push(tp); nextInternalId++
        
        const fin = {
            _id: nextInternalId, bracket: 'final', stageLevel: 0, matchIndex: 1,
            team1Id: null, team2Id: null, team1Source: 'winner', team2Source: 'winner',
            team1SourceMatchId: sf1._id, team2SourceMatchId: sf2._id,
            nextMatchId: null, nextMatchSlot: null, loserMatchId: null, loserMatchSlot: null,
            isBye1: false, isBye2: false
        }
        allMatches.push(fin)
        
        sf1.nextMatchId = fin._id; sf1.nextMatchSlot = 'team1'
        sf1.loserMatchId = tp._id; sf1.loserMatchSlot = 'team1'
        sf2.nextMatchId = fin._id; sf2.nextMatchSlot = 'team2'
        sf2.loserMatchId = tp._id; sf2.loserMatchSlot = 'team2'
        
        const wm1 = findMatch(allMatches, wbTeam1MatchId)
        const wm2 = findMatch(allMatches, wbTeam2MatchId)
        if (wm1) { wm1.nextMatchId = sf1._id; wm1.nextMatchSlot = 'team1' }
        if (wm2) { wm2.nextMatchId = sf2._id; wm2.nextMatchSlot = 'team1' }
        
        const lm1 = findMatch(allMatches, lbTeam1MatchId)
        const lm2 = findMatch(allMatches, lbTeam2MatchId)
        if (lm1) { lm1.nextMatchId = sf2._id; lm1.nextMatchSlot = 'team2' }
        if (lm2) { lm2.nextMatchId = sf1._id; lm2.nextMatchSlot = 'team2' }
    }

    // ============================================================
    // ПЕРЕНОМЕРОВЫВАЕМ В ПОРЯДКЕ РАУНДОВ
    // ============================================================
    const roundOrder = buildRoundOrderForGeneration(allMatches, wMatches, lMatches, roundsW)
    
    const idMap = {}
    let realId = 1
    
    for (const round of roundOrder) {
        const roundMatches = allMatches.filter(m => 
            m.bracket === round.bracket && m.stageLevel === round.stage
        ).sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0))
        
        for (const m of roundMatches) {
            if (!idMap[m._id]) idMap[m._id] = realId++
        }
    }
    
    const ffMatches = allMatches.filter(m => 
        ['semifinal', 'third_place', 'final'].includes(m.bracket)
    ).sort((a, b) => {
        if (a.bracket === 'semifinal' && b.bracket !== 'semifinal') return -1
        if (b.bracket === 'semifinal' && a.bracket !== 'semifinal') return 1
        if (a.bracket === 'semifinal' && b.bracket === 'semifinal') return (a.matchIndex || 0) - (b.matchIndex || 0)
        if (a.bracket === 'third_place' && b.bracket === 'final') return -1
        if (a.bracket === 'final' && b.bracket === 'third_place') return 1
        return 0
    })
    
    for (const m of ffMatches) {
        if (!idMap[m._id]) idMap[m._id] = realId++
    }
    
    const result = allMatches.map(m => ({
        matchId: idMap[m._id] || m._id,
        bracket: m.bracket,
        stageLevel: m.stageLevel,
        matchIndex: m.matchIndex,
        team1Id: m.team1Id,
        team2Id: m.team2Id,
        team1Source: m.team1Source,
        team2Source: m.team2Source,
        team1SourceMatchId: m.team1SourceMatchId ? (idMap[m.team1SourceMatchId] || m.team1SourceMatchId) : null,
        team2SourceMatchId: m.team2SourceMatchId ? (idMap[m.team2SourceMatchId] || m.team2SourceMatchId) : null,
        nextMatchId: m.nextMatchId ? (idMap[m.nextMatchId] || m.nextMatchId) : null,
        nextMatchSlot: m.nextMatchSlot || null,
        loserMatchId: m.loserMatchId ? (idMap[m.loserMatchId] || m.loserMatchId) : null,
        loserMatchSlot: m.loserMatchSlot || null,
        isBye1: m.isBye1 || false,
        isBye2: m.isBye2 || false,
        winnerId: null
    }))
    
    return result
}

function findMatch(matches, id) {
    return matches.find(m => m._id === id)
}

function buildRoundOrderForGeneration(matches, wMatches, lMatches, roundsW) {
    const wStages = Object.keys(wMatches).map(Number).sort((a, b) => a - b)
    const lStages = Object.keys(lMatches).map(Number).sort((a, b) => a - b)
    const maxWStage = Math.max(...wStages)
    
    const hasW2 = wStages.includes(2)
    const w1Count = (wMatches[1] || []).length
    const S = w1Count * 2
    const isStrategyB = hasW2 && (wMatches[2] || []).length === S / 4
    
    const roundOrder = []
    
    if (isStrategyB) {
        roundOrder.push({ bracket: 'winners', stage: 1 })
        roundOrder.push({ bracket: 'winners', stage: 2 })
        if (lStages.includes(1)) roundOrder.push({ bracket: 'losers', stage: 1 })
        if (lStages.includes(2)) roundOrder.push({ bracket: 'losers', stage: 2 })
        
        let r = 3
        while (r <= maxWStage + 2) {
            if (wStages.includes(r)) roundOrder.push({ bracket: 'winners', stage: r })
            if (lStages.includes(r)) roundOrder.push({ bracket: 'losers', stage: r })
            r++
        }
    } else {
        for (let r = 1; r <= maxWStage + 2; r++) {
            if (wStages.includes(r)) roundOrder.push({ bracket: 'winners', stage: r })
            if (lStages.includes(r)) roundOrder.push({ bracket: 'losers', stage: r })
        }
    }
    
    return roundOrder
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function setAllLinks(matches, wMatches, lMatches, roundsW, internalToMatch) {
    // Связи в верхней сетке
    for (let r = 1; r < roundsW; r++) {
        if (!wMatches[r]) continue
        for (let i = 0; i < wMatches[r].length; i++) {
            const match = internalToMatch[wMatches[r][i]]
            if (!match) continue
            const nextIdx = Math.floor(i / 2)
            if (wMatches[r + 1] && nextIdx < wMatches[r + 1].length) {
                match.nextMatchId = wMatches[r + 1][nextIdx]
            }
        }
    }
    
    // Связи в нижней сетке
    for (let r = 1; r <= roundsW + 2; r++) {
        if (!lMatches[r]) continue
        for (let i = 0; i < lMatches[r].length; i++) {
            const match = internalToMatch[lMatches[r][i]]
            if (!match) continue
            if (lMatches[r + 1]) {
                const nextIdx = Math.floor(i / 2)
                if (nextIdx < lMatches[r + 1].length) {
                    match.nextMatchId = lMatches[r + 1][nextIdx]
                }
            }
        }
    }
    
    // Связываем проигравших W1 и W2 с L1 (для стратегии Б)
    const l1Matches = lMatches[1] || []
    if (l1Matches.length > 0 && wMatches[2]) {
        // Находим реальные матчи L1 и связываем с W1 и W2
        const realL1 = matches.filter(m => 
            m.bracket === 'losers' && m.stageLevel === 1 && !m.isBye1 && !m.isBye2
        )
        const w2MatchesList = matches.filter(m => m.bracket === 'winners' && m.stageLevel === 2)
        
        // Связываем проигравших W2 с L1
        w2MatchesList.forEach(wMatch => {
            const lMatch = realL1.find(m => 
                m.team1SourceMatchId === wMatch.internalId || 
                m.team2SourceMatchId === wMatch.internalId
            )
            if (lMatch) {
                wMatch.loserMatchId = lMatch.internalId
            }
        })
        
        // Связываем проигравших W1 с L1
        const w1MatchesList = matches.filter(m => 
            m.bracket === 'winners' && m.stageLevel === 1 && !m.isBye2
        )
        w1MatchesList.forEach(wMatch => {
            const lMatch = realL1.find(m => 
                m.team1SourceMatchId === wMatch.internalId || 
                m.team2SourceMatchId === wMatch.internalId
            )
            if (lMatch) {
                wMatch.loserMatchId = lMatch.internalId
            }
        })
    }
    
    // Связываем проигравших W3+ с большой частью нижней сетки
    for (let r = 3; r <= roundsW; r++) {
        if (!wMatches[r]) continue
        const wMatchesInRound = matches.filter(m => m.bracket === 'winners' && m.stageLevel === r)
        wMatchesInRound.forEach(wMatch => {
            const lMatch = matches.find(m => 
                m.bracket === 'losers' && 
                (m.team1SourceMatchId === wMatch.internalId || 
                 m.team2SourceMatchId === wMatch.internalId)
            )
            if (lMatch) {
                wMatch.loserMatchId = lMatch.internalId
            }
        })
    }
}

loadTournament()
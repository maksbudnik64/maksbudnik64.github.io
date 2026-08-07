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
        } else if (format === 'Двойное выбывание (Double Elimination)') {
            setTabs({ standings: false, matches: false, bracket: true, counter: true }, bracketTab)
            if (sectionGroups) sectionGroups.style.display = 'none'
            if (sectionBracket) sectionBracket.style.display = 'block'
            if (counterSectionEl) counterSectionEl.style.display = 'block'
            await loadPlayoffBracket(eventId)
        } else {
            setTabs({ standings: true, matches: true, bracket: false, counter: true }, standingsTab)
            if (sectionGroups) sectionGroups.style.display = 'block'
            if (sectionBracket) sectionBracket.style.display = 'none'
            if (counterSectionEl) counterSectionEl.style.display = 'block'
            await loadGroupStage(eventId)
        }

        await loadMatchesForCounter(eventId)

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
// ПЛЕЙ-ОФФ И DE
// ============================================================

function renderTournamentBracket(matches, matchSetsMap = {}) {
    const format = tournament?.tournamentFormat
    const isDE = format === 'Двойное выбывание (Double Elimination)' || 
                 matches.some(m => m.bracket === 'losers' || m.bracket === 'winners')
    
    if (isDE) {
        if (matches.length === 0) {
            const emptyDiv = document.createElement('div')
            emptyDiv.className = 'card'
            emptyDiv.style.cssText = 'text-align:center;padding:40px;'
            emptyDiv.textContent = 'Нет матчей'
            return emptyDiv
        }
        
        const teamNames = {}
        matches.forEach(m => {
            if (m.team1Id) teamNames[m.team1Id] = getTeamNameFromMatch(m, 'team1')
            if (m.team2Id) teamNames[m.team2Id] = getTeamNameFromMatch(m, 'team2')
        })
        
        const tempContainer = document.createElement('div')
        const renderer = new BracketRenderer({
            container: tempContainer,
            matches: matches,
            parseTeamPlayers,
            teamNames,
            interactive: false,
            isDoubleElimination: true,
            matchSetsMap: matchSetsMap
        })
        renderer.renderFromMatches(matches)
        return tempContainer  // ← возвращаем DOM-элемент
    }
    
    // Для обычного плей-офф
    const playoffMatches = matches.filter(m => m.stageLevel > 0)
    if (playoffMatches.length === 0) {
        const emptyDiv = document.createElement('div')
        emptyDiv.className = 'card'
        emptyDiv.style.cssText = 'text-align:center;padding:40px;'
        emptyDiv.textContent = 'Нет матчей плей-офф'
        return emptyDiv
    }

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
    console.log('renderTournamentBracket returns:', typeof tempContainer, tempContainer instanceof HTMLElement);
    return tempContainer  // ← возвращаем DOM-элемент
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

        // Загружаем сеты
        const matchIds = matches.map(m => m.matchId)
        let matchSetsMap = {}
        if (matchIds.length > 0) {
            try {
                const setsData = await apiGet(`/events/${eventId}/matches/sets?matchIds=${matchIds.join(',')}`)
                if (setsData.success) {
                    matchSetsMap = setsData.setsMap || {}
                }
            } catch (err) {
                console.error('Ошибка загрузки сетов:', err)
            }
        }

        const result = renderTournamentBracket(matches, matchSetsMap)
        console.log('Result type:', typeof result, 'is Element:', result instanceof Element);
        console.log('Result innerHTML length:', result.innerHTML?.length);
        console.log('Has click handlers:', result.querySelector('.bracket-cell')?.onclick);
        sectionBracket.innerHTML = ''  // ← очищаем
        sectionBracket.appendChild(result)  // ← добавляем DOM-элемент
        console.log('sectionBracket children:', sectionBracket.children.length);
        console.log('First child:', sectionBracket.children[0]?.className);
    } catch (error) {
        console.error('Ошибка загрузки сетки:', error)
        if (sectionBracket) sectionBracket.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:red;">Ошибка: ${error.message}</div>`
    }
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

        // Загружаем сеты для всех матчей
        const matchIds = allMatches.map(m => m.matchId)
        let matchSetsMap = {}
        if (matchIds.length > 0) {
            try {
                const setsData = await apiGet(`/events/${eventId}/matches/sets?matchIds=${matchIds.join(',')}`)
                if (setsData.success) {
                    matchSetsMap = setsData.setsMap || {}
                }
            } catch (err) {
                console.error('Ошибка загрузки сетов:', err)
            }
        }

        const groupNames = Object.keys(groups).filter(name => name !== 'all')
        const advanceCount = tournament?.advanceCount || 1
        tournamentData = { groups, matches: allMatches, eventId, advanceCount, groupCount: groupNames.length, matchSetsMap }

        renderGroups(groups, allMatches, matchSetsMap)
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
        
        // Формируем ссылки на профили игроков
        const playersLinks = team.players && team.players.length > 0
            ? team.players.map(p => `<a href="profile.html?id=${p.userId}" target="_blank" style="color: inherit; text-decoration: none;">${p.surname || p.name}</a>`).join(' · ')
            : getTeamNameFromTeam(team)

        html += `
            <div class="${rowClass}">
                <span>${position}</span><span>${playersLinks}</span>
                <span>${team.played}</span><span>${team.wins}</span>
                <span class="standings-points">${team.points}</span>
            </div>`
    })
    return html
}

function renderMatches(matches, matchSetsMap = {}) {
    if (!matches || matches.length === 0) return '<div style="padding:12px;color:#6b7583;">Нет матчей</div>'
    return `<div class="matches-grid">${matches.map(match => {
        const isFinished = match.winnerId !== null
        const team1Name = getTeamNameFromMatch(match, 'team1')
        const team2Name = getTeamNameFromMatch(match, 'team2')
        
        const team1Links = match.team1Players && match.team1Players.length > 0
            ? match.team1Players.map(p => `<a href="profile.html?id=${p.userId}" target="_blank" style="color: inherit; text-decoration: none;">${p.surname}</a>`).join(' · ')
            : team1Name
        
        const team2Links = match.team2Players && match.team2Players.length > 0
            ? match.team2Players.map(p => `<a href="profile.html?id=${p.userId}" target="_blank" style="color: inherit; text-decoration: none;">${p.surname}</a>`).join(' · ')
            : team2Name

        const matchSets = matchSetsMap[match.matchId] || []
        const hasSets = isFinished && matchSets.length > 0
        
        let setScoresHtml = ''
        if (hasSets) {
            setScoresHtml = `
    <div class="match-set-scores" style="display: none;">
        ${matchSets.map((s, i) => `
            <span>${i + 1}. <b style="color: ${s.winner === 1 ? '#c49a2c' : '#5f6b7a'}; font-weight: 700;">${s.team1Score}</b>:<b style="color: ${s.winner === 2 ? '#c49a2c' : '#5f6b7a'}; font-weight: 700;">${s.team2Score}</b></span>
        `).join('')}
    </div>`
        }

        const team1Won = match.winnerId === match.team1Id
        const team2Won = match.winnerId === match.team2Id
        const mainScoreHtml = isFinished 
            ? `<b style="color: ${team1Won ? '#c49a2c' : '#5f6b7a'};">${match.setsTeam1 || 0}</b><span style="color: #8e9aab;">:</span><b style="color: ${team2Won ? '#c49a2c' : '#5f6b7a'};">${match.setsTeam2 || 0}</b>`
            : '<span style="color: #8e9aab;">—:—</span>'

        const arrowHtml = hasSets 
            ? `<i class="fas fa-chevron-down match-score-arrow" style="font-size: 0.6rem; color: #8e9aab; margin-left: 3px; transition: transform 0.2s;"></i>` 
            : ''

        return `
            <div class="matchRow ${isFinished ? 'matchRow-finished' : ''}">
                <span class="matchScore" onclick="event.stopPropagation(); toggleMatchSets(this)" 
                      style="cursor: ${hasSets ? 'pointer' : 'default'}; display: flex; align-items: center; gap: 2px;" 
                      title="${hasSets ? 'Нажмите для просмотра по сетам' : ''}">
                    <span>${mainScoreHtml}</span>${arrowHtml}
                </span>
                <span class="matchTeam" style="text-align: center;">${team1Links}</span>
                <span class="matchVs">VS</span>
                <span class="matchTeam" style="text-align: center;">${team2Links}</span>
                ${!isFinished ? `<button class="matchGoBtn" onclick="event.stopPropagation(); selectMatch(${match.matchId})" title="Открыть в счётчике">▶</button>` : ''}
            </div>
            ${setScoresHtml}`
    }).join('')}</div>`
}

// Функция переключения отображения счёта по сетам
window.toggleMatchSets = function(element) {
    const scoreSpan = element.closest('.matchScore')
    const row = scoreSpan.closest('.matchRow')
    const setsDiv = row.nextElementSibling
    const arrow = scoreSpan.querySelector('.match-score-arrow')
    
    if (!setsDiv || !setsDiv.classList.contains('match-set-scores')) return
    
    const isVisible = setsDiv.style.display === 'block'
    
    // Закрываем все открытые сеты
    document.querySelectorAll('.match-set-scores').forEach(el => el.style.display = 'none')
    document.querySelectorAll('.match-score-arrow').forEach(el => el.style.transform = 'rotate(0deg)')
    
    if (!isVisible) {
        setsDiv.style.display = 'block'
        if (arrow) arrow.style.transform = 'rotate(180deg)'
    }
}

// Закрытие по клику вне
document.addEventListener('click', function(e) {
    if (!e.target.closest('.matchScore') && !e.target.closest('.match-set-scores')) {
        document.querySelectorAll('.match-set-scores').forEach(el => el.style.display = 'none')
    }
})

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

function renderGroups(groups, allMatches, matchSetsMap = {}) {
    if (!sectionGroups) return
    sectionGroups.innerHTML = ''
    const groupNames = Object.keys(groups).filter(name => name !== 'all' && name !== '')

    if (groupNames.length === 0) {
        sectionGroups.appendChild(createGroupBlock('all', groups['all'] || [], allMatches, matchSetsMap))
    } else {
        groupNames.sort().forEach(groupName => {
            const groupTeams = groups[groupName] || []
            const groupMatches = allMatches.filter(m =>
                groupTeams.some(t => t.teamId === m.team1Id) &&
                groupTeams.some(t => t.teamId === m.team2Id)
            )
            sectionGroups.appendChild(createGroupBlock(groupName, groupTeams, groupMatches, matchSetsMap))
        })
    }
}

function createGroupBlock(groupName, groupTeams, groupMatches, matchSetsMap = {}) {
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
            <div class="card"><div class="cardHeader"><h3>Матчи</h3></div>${renderMatches(groupMatches, matchSetsMap)}</div>
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
    const validTeams = qualifiedTeams.filter(t => t.teamId);
    if (validTeams.length === 0) return [];

    // 1. Группируем по группам и сортируем внутри
    const groupsMap = {};
    validTeams.forEach(t => {
        if (!groupsMap[t.groupName]) groupsMap[t.groupName] = [];
        groupsMap[t.groupName].push(t);
    });
    Object.values(groupsMap).forEach(g => g.sort(compareTeamRating));

    const groupNames = Object.keys(groupsMap).sort();
    const maxPosition = Math.max(...Object.values(groupsMap).map(g => g.length));

    // 2. Собираем команды: 1-е места всех групп, потом 2-е и т.д.
    const ordered = [];
    for (let pos = 1; pos <= maxPosition; pos++) {
        const positionTeams = [];
        groupNames.forEach(g => {
            if (groupsMap[g].length >= pos) {
                positionTeams.push({ ...groupsMap[g][pos - 1], position: pos, groupName: g });
            }
        });
        positionTeams.sort(compareTeamRating);
        ordered.push(...positionTeams);
    }

    const totalTeams = ordered.length;
    const byeCount = totalSlots - totalTeams;
    const totalMatches = totalSlots / 2;

    // 3. Создаём слоты
    const slots = Array.from({ length: totalSlots }, (_, i) => ({
        id: i, teamId: null, isBye: false, teamData: null
    }));

    const byeTeams = ordered.slice(0, byeCount);
    const playingTeams = ordered.slice(byeCount);

    // 4. Формируем пары для играющих команд
    const pairs = [];
    const used = new Set();

    for (let i = 0; i < playingTeams.length; i++) {
        if (used.has(i)) continue;
        const team1 = playingTeams[i];
        let pairFound = false;

        for (let j = playingTeams.length - 1; j > i; j--) {
            if (used.has(j)) continue;
            if (team1.groupName !== playingTeams[j].groupName) {
                pairs.push({ team1, team2: playingTeams[j] });
                used.add(i);
                used.add(j);
                pairFound = true;
                break;
            }
        }

        if (!pairFound) {
            for (let j = playingTeams.length - 1; j > i; j--) {
                if (used.has(j)) continue;
                pairs.push({ team1, team2: playingTeams[j] });
                used.add(i);
                used.add(j);
                pairFound = true;
                break;
            }
        }

        if (!pairFound) {
            pairs.push({ team1, team2: null });
            used.add(i);
        }
    }

    // 5. Распределяем BYE и пары по сетке так, чтобы BYE были в разных половинах
    //    Матчи нумеруются: 0, 1, 2, 3 (для 8 слотов)
    //    Верхняя половина: матчи 0, 1 (победители встречаются в полуфинале)
    //    Нижняя половина: матчи 2, 3 (победители встречаются в полуфинале)
    //    BYE должны быть в разных половинах!
    
    // План размещения для 8 слотов (4 матча):
    // Матч 0 (слоты 0-1): BYE 1 (верхняя половина)
    // Матч 1 (слоты 2-3): пара 1
    // Матч 2 (слоты 4-5): BYE 2 (нижняя половина)
    // Матч 3 (слоты 6-7): пара 2
    
    const halfMatches = totalMatches / 2; // 2 матча в половине
    
    // Сначала размещаем BYE: по одному в каждой половине
    const byePositions = [];
    for (let i = 0; i < byeCount; i++) {
        // Чередуем половины: 0 → верх, 1 → низ, 2 → верх, 3 → низ...
        const halfIndex = i % 2; // 0 или 1
        const matchInHalf = Math.floor(i / 2); // 0, 0, 1, 1...
        const matchNum = halfIndex * halfMatches + matchInHalf;
        byePositions.push(matchNum);
    }
    
    // Размещаем BYE
    byeTeams.forEach((team, i) => {
        const matchNum = byePositions[i] !== undefined ? byePositions[i] : i;
        if (matchNum < totalMatches) {
            const slotA = matchNum * 2;
            const slotB = matchNum * 2 + 1;
            slots[slotA].teamId = team.teamId;
            slots[slotA].isBye = true;
            slots[slotA].teamData = team;
            slots[slotB].isBye = true;
        }
    });
    
    // Находим свободные матчи (где нет BYE)
    const freeMatches = [];
    for (let i = 0; i < totalMatches; i++) {
        if (!slots[i * 2].teamId && !slots[i * 2 + 1].teamId) {
            freeMatches.push(i);
        }
    }
    
    // Размещаем пары в свободные матчи
    pairs.forEach((pair, idx) => {
        if (idx < freeMatches.length) {
            const matchNum = freeMatches[idx];
            const slotA = matchNum * 2;
            const slotB = matchNum * 2 + 1;
            
            slots[slotA].teamId = pair.team1.teamId;
            slots[slotA].teamData = pair.team1;
            
            if (pair.team2) {
                slots[slotB].teamId = pair.team2.teamId;
                slots[slotB].teamData = pair.team2;
            } else {
                slots[slotB].isBye = true;
            }
        }
    });
    
    // Оставшиеся свободные слоты — BYE
    slots.forEach(s => {
        if (!s.teamId) s.isBye = true;
    });

    return slots;
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
    console.log('📋 Слоты перед рендером:', slots.map(s => ({
    id: s.id,
    teamId: s.teamId,
    teamName: s.teamData?.displayName || '—',
    isBye: s.isBye
})))

console.log('📋 Команды для BracketRenderer:', qualifiedTeams.filter(t => t.teamId).map(t => ({
    teamId: t.teamId,
    name: t.displayName
})))
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
    updateSetScoresDisplay()  // ← ДОБАВИТЬ
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

        const isDE = data.matches.some(m => m.bracket === 'winners' || m.bracket === 'losers')
        const matchNumMap = getMatchNumberingMap(data.matches, isDE)
        
        // Сортируем доступные матчи по порядковым номерам
        availableMatches.sort((a, b) => {
            return (matchNumMap[a.matchId] || 9999) - (matchNumMap[b.matchId] || 9999)
        })

        // Вычисляем раунды для DE (точно как в BracketRenderer)
        const roundMap = {}
        if (isDE) {
            const winnersMatches = data.matches.filter(m => m.bracket === 'winners')
            const losersMatches = data.matches.filter(m => m.bracket === 'losers')
            
            const wStages = [...new Set(winnersMatches.map(m => m.stageLevel || 0))].sort((a, b) => a - b)
            const lStages = [...new Set(losersMatches.map(m => m.stageLevel || 0))].sort((a, b) => a - b)
            const isStrategyB = wStages.includes(2) && lStages.length >= 2
            
            const getRoundNumber = (bracket, stageLevel) => {
                if (isStrategyB) {
                    if (bracket === 'winners' && stageLevel === 1) return 1
                    if (bracket === 'winners' && stageLevel === 2) return 2
                    if (bracket === 'losers' && stageLevel === 1) return 3
                    if (bracket === 'losers' && stageLevel === 2) return 4
                    let roundNum = 5
                    for (let s = 3; s < stageLevel; s++) {
                        if (wStages.includes(s)) roundNum++
                        if (lStages.includes(s)) roundNum++
                    }
                    if (bracket === 'winners') return roundNum
                    if (bracket === 'losers') return roundNum + 1
                } else {
                    if (bracket === 'winners') return stageLevel * 2 - 1
                    if (bracket === 'losers') return stageLevel * 2
                }
                return stageLevel
            }
            
            // Вычисляем раунд для каждого матча
            data.matches.forEach(m => {
                if (m.bracket === 'winners' || m.bracket === 'losers') {
                    roundMap[m.matchId] = getRoundNumber(m.bracket, m.stageLevel || 0)
                }
            })
        }

        availableMatches.forEach(match => {
            const name1 = getTeamNameFromMatch(match, 'team1')
            const name2 = getTeamNameFromMatch(match, 'team2')
            const displayNum = matchNumMap[match.matchId] || match.matchId

            let prefix
            
            if (match.stageLevel === 0 && !match.bracket) {
                const g1 = teamGroupMap[match.team1Id], g2 = teamGroupMap[match.team2Id]
                prefix = (g1 && g2 && g1 === g2) ? `Группа ${g1}` : `Группа ${g1 || g2 || ''}`
            } else if (match.bracket === 'semifinal') {
                prefix = 'Полуфинал'
            } else if (match.bracket === 'third_place') {
                prefix = 'За 3-4 место'
            } else if (match.bracket === 'final') {
                prefix = '🏆 Финал'
            } else if (isDE && (match.bracket === 'winners' || match.bracket === 'losers')) {
                const roundNum = roundMap[match.matchId] || match.stageLevel
                prefix = `Раунд ${roundNum}`
            } else {
                const maxStageLevel = Math.max(...data.matches.map(m => m.stageLevel || 0))
                prefix = getRoundName(match.stageLevel, maxStageLevel)
            }

            const option = document.createElement('option')
            option.value = match.matchId
            option.textContent = `M${displayNum} · ${prefix}: ${name1} vs ${name2}`
            option.dataset.team1Id = match.team1Id
            option.dataset.team2Id = match.team2Id
            option.dataset.team1Name = name1
            option.dataset.team2Name = name2
            option.dataset.roundName = prefix
            option.dataset.displayNum = displayNum
            matchSelect.appendChild(option)
        })

        matchSelect.addEventListener('change', onMatchSelect)
    } catch (error) {
        console.error('Ошибка загрузки матчей:', error)
    }
}

function getMatchNumberingMap(matches, isDE) {
    const numMap = {}
    let displayNum = 1
    
    if (!matches || !Array.isArray(matches) || matches.length === 0) {
        console.warn('getMatchNumberingMap: no matches')
        return numMap
    }
    
    if (!isDE) {
        const sorted = [...matches]
            .filter(m => m && (m.stageLevel > 0 || m.bracket))
            .sort((a, b) => {
                if ((a.stageLevel || 0) !== (b.stageLevel || 0)) return (a.stageLevel || 0) - (b.stageLevel || 0)
                return (a.matchIndex || 0) - (b.matchIndex || 0)
            })
        sorted.forEach(m => { if (m && m.matchId) numMap[m.matchId] = displayNum++ })
        return numMap
    }
    
    // DE турнир
    const winnersMatches = (matches || []).filter(m => m && m.bracket === 'winners')
    const losersMatches = (matches || []).filter(m => m && m.bracket === 'losers')
    const semifinals = (matches || []).filter(m => m && m.bracket === 'semifinal')
    const thirdPlace = (matches || []).filter(m => m && m.bracket === 'third_place')
    const final = (matches || []).filter(m => m && m.bracket === 'final')
    
    // Собираем уникальные stageLevel
    const wStages = [...new Set(winnersMatches.map(m => m.stageLevel || 0))].sort((a, b) => a - b)
    const lStages = [...new Set(losersMatches.map(m => m.stageLevel || 0))].sort((a, b) => a - b)
    
    const maxStage = Math.max(
        wStages.length > 0 ? Math.max(...wStages) : 0,
        lStages.length > 0 ? Math.max(...lStages) : 0
    )
    
    // Определяем стратегию
    const hasW2 = wStages.includes(2)
    const isStrategyB = hasW2 && lStages.length >= 2
    
    if (isStrategyB) {
        // WB1
        winnersMatches.filter(m => (m.stageLevel||0) === 1)
            .sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0))
            .forEach(m => { numMap[m.matchId] = displayNum++ })
        // WB2
        winnersMatches.filter(m => (m.stageLevel||0) === 2)
            .sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0))
            .forEach(m => { numMap[m.matchId] = displayNum++ })
        // LB1
        losersMatches.filter(m => (m.stageLevel||0) === 1)
            .sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0))
            .forEach(m => { numMap[m.matchId] = displayNum++ })
        // LB2
        losersMatches.filter(m => (m.stageLevel||0) === 2)
            .sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0))
            .forEach(m => { numMap[m.matchId] = displayNum++ })
        // Остальные раунды
        for (let s = 3; s <= maxStage; s++) {
            winnersMatches.filter(m => (m.stageLevel||0) === s)
                .sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0))
                .forEach(m => { numMap[m.matchId] = displayNum++ })
            losersMatches.filter(m => (m.stageLevel||0) === s)
                .sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0))
                .forEach(m => { numMap[m.matchId] = displayNum++ })
        }
    } else {
        for (let s = 1; s <= maxStage; s++) {
            winnersMatches.filter(m => (m.stageLevel||0) === s)
                .sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0))
                .forEach(m => { numMap[m.matchId] = displayNum++ })
            losersMatches.filter(m => (m.stageLevel||0) === s)
                .sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0))
                .forEach(m => { numMap[m.matchId] = displayNum++ })
        }
    }
    
    // Финал четырёх
    semifinals.sort((a, b) => (a.matchIndex||0) - (b.matchIndex||0))
        .forEach(m => { numMap[m.matchId] = displayNum++ })
    thirdPlace.sort((a, b) => (a.matchIndex||0) - (b.matchIndex||0))
        .forEach(m => { numMap[m.matchId] = displayNum++ })
    final.sort((a, b) => (a.matchIndex||0) - (b.matchIndex||0))
        .forEach(m => { numMap[m.matchId] = displayNum++ })
    
    return numMap
}

async function onMatchSelect(event) {
    const option = event.target.options[event.target.selectedIndex]
    const resetBtn = document.getElementById('btn-reset-score')
    const nextSetBtn = document.getElementById('btn-next-set')
    const finishMatchBtn = document.getElementById('btn-finish-match')

    if (!option?.value) {
        document.getElementById('counter-team1-display').textContent = 'Команда 1'
        document.getElementById('counter-team2-display').textContent = 'Команда 2'
        document.getElementById('match-status-tag').textContent = 'Выберите матч'
        document.getElementById('set-scores-display').innerHTML = ''
        resetBtn.disabled = nextSetBtn.disabled = finishMatchBtn.disabled = true
        return
    }

    document.getElementById('counter-team1-display').textContent = option.dataset.team1Name
    document.getElementById('counter-team2-display').textContent = option.dataset.team2Name
    document.getElementById('match-status-tag').textContent = option.dataset.roundName || 'Матч'
    document.getElementById('counter').dataset.currentMatchId = option.value

    // Загружаем существующие сеты
    const matchId = option.value
    try {
        const setsData = await apiGet(`/events/${document.getElementById('counter').dataset.eventId || new URLSearchParams(window.location.search).get('id')}/matches/${matchId}/sets`)
        if (setsData.success && setsData.sets && setsData.sets.length > 0) {
            // Восстанавливаем сеты из БД
            currentSets = setsData.sets.map(s => ({
                team1: s.team1Score,
                team2: s.team2Score,
                finished: true,
                winner: s.winner
            }))
            currentSetIndex = currentSets.length - 1
            updateMainScore()
            updateSetsSummary()
            updateSetScoresDisplay()
        } else {
            initializeSets()
        }
    } catch (err) {
        initializeSets()
    }
    
    enableKeyboardEdit()
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

function updateSetScoresDisplay() {
    const container = document.getElementById('set-scores-display')
    if (!container) return
    
    const finishedSets = currentSets.filter(s => s.finished)
    
    if (finishedSets.length === 0) {
        container.innerHTML = ''
        return
    }
    
    container.innerHTML = finishedSets.map((set, index) => {
        const winnerClass = set.winner === 1 ? 'winner-left' : set.winner === 2 ? 'winner-right' : ''
        return `
            <div class="counter-set-badge ${winnerClass}">
                <span class="set-number">${index + 1}.</span>
                <span class="set-score-left">${set.team1}</span>
                <span class="set-score-colon">:</span>
                <span class="set-score-right">${set.team2}</span>
            </div>`
    }).join('')
}

// Вызывайте в updateMainScore и updateSetsSummary
function updateMainScore() {
    const set = currentSets[currentSetIndex]
    if (!set) return
    const leftEl = document.querySelector('.counter-score-left span')
    const rightEl = document.querySelector('.counter-score-right span')
    if (leftEl) leftEl.textContent = set.team1
    if (rightEl) rightEl.textContent = set.team2
    updateSetScoresDisplay()
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

// ============================================================
// ВВОД СЧЁТА С КЛАВИАТУРЫ
// ============================================================

function enableKeyboardEdit() {
    const leftScore = document.querySelector('[data-js-count-left]')
    const rightScore = document.querySelector('[data-js-count-right]')
    const setsLeft = document.getElementById('sets-team1-count')
    const setsRight = document.getElementById('sets-team2-count')

    if (leftScore) {
        leftScore.style.cursor = 'pointer'
        leftScore.title = 'Нажмите для ввода с клавиатуры'
        leftScore.addEventListener('click', () => startEditScore('left'))
    }

    if (rightScore) {
        rightScore.style.cursor = 'pointer'
        rightScore.title = 'Нажмите для ввода с клавиатуры'
        rightScore.addEventListener('click', () => startEditScore('right'))
    }

    if (setsLeft) {
        setsLeft.style.cursor = 'pointer'
        setsLeft.title = 'Нажмите для ввода'
        setsLeft.addEventListener('click', () => startEditSets('left'))
    }

    if (setsRight) {
        setsRight.style.cursor = 'pointer'
        setsRight.title = 'Нажмите для ввода'
        setsRight.addEventListener('click', () => startEditSets('right'))
    }
}

function startEditScore(side) {
    const set = currentSets[currentSetIndex]
    if (!set || set.finished) return

    const parentClass = side === 'left' ? 'counter-score-left' : 'counter-score-right'
    const parent = document.querySelector(`.${parentClass}`)
    if (!parent) return

    const currentValue = side === 'left' ? set.team1 : set.team2
    const span = parent.querySelector('span')
    if (!span) return

    const input = document.createElement('input')
    input.type = 'number'
    input.min = '0'
    input.max = '99'
    input.maxLength = 2
    input.value = currentValue
    input.inputMode = 'numeric'
    
    // Дополнительные ограничения
    input.addEventListener('input', () => {
        // Убираем нецифровые символы
        input.value = input.value.replace(/[^0-9]/g, '')
        // Ограничиваем двумя символами
        if (input.value.length > 2) {
            input.value = input.value.slice(0, 2)
        }
        // Ограничение по значению
        if (parseInt(input.value) > 99) {
            input.value = '99'
        }
    })

    span.replaceWith(input)
    input.focus()
    input.select()

    const saveScore = () => {
        let value = parseInt(input.value)
        if (isNaN(value)) value = currentValue
        if (value < 0) value = 0
        if (value > 99) value = 99

        if (side === 'left') {
            set.team1 = value
        } else {
            set.team2 = value
        }

        updateMainScore()

        const newSpan = document.createElement('span')
        newSpan.textContent = value
        newSpan.style.cursor = 'pointer'
        newSpan.title = 'Нажмите для ввода с клавиатуры'
        newSpan.addEventListener('click', () => startEditScore(side))
        input.replaceWith(newSpan)
    }

    const cancelEdit = () => {
        const newSpan = document.createElement('span')
        newSpan.textContent = currentValue
        newSpan.style.cursor = 'pointer'
        newSpan.title = 'Нажмите для ввода с клавиатуры'
        newSpan.addEventListener('click', () => startEditScore(side))
        input.replaceWith(newSpan)
    }

    input.addEventListener('blur', saveScore)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            input.blur()
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            cancelEdit()
        }
    })
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
    updateSetScoresDisplay()  // ← ДОБАВИТЬ
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
    updateSetScoresDisplay()  // ← ДОБАВИТЬ
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

        // Сохраняем результат матча
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
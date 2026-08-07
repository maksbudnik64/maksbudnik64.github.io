import { nextPowerOfTwo, getRoundName, getTeamNameFromMatch, getTeamNameFromTeam } from './utils.js';

export class BracketRenderer {
    constructor(options = {}) {
        this.container = options.container || null;
        this.matches = options.matches || [];
        this.teams = options.teams || [];
        this.teamNames = options.teamNames || {};
        this.parseTeamPlayers = options.parseTeamPlayers || ((d) => d);
        this.onChange = options.onChange || null;
        this.distributionMode = options.distributionMode || 'random';
        this.interactive = options.interactive || false;
        this.isDoubleElimination = options.isDoubleElimination || false;
        this.matchSetsMap = options.matchSetsMap || {};
        this.slots = [];
        this.totalSlots = 0;
        this.rounds = 0;
        this.byeCount = 0;
        this.draggedItem = null;

        this._boundDragStart = this._dragStartHandler.bind(this);
        this._boundDragEnd = this._dragEndHandler.bind(this);
        this._boundDragOver = this._dragOverHandler.bind(this);
        this._boundDragLeave = this._dragLeaveHandler.bind(this);
        this._boundDrop = this._dropHandler.bind(this);
    }

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ И РАСПРЕДЕЛЕНИЕ
    // ============================================================

    _initSlots() {
        const N = this.teams.length;
        this.totalSlots = nextPowerOfTwo(N);
        this.byeCount = this.totalSlots - N;
        this.rounds = Math.log2(this.totalSlots);
        this.slots = Array.from({ length: this.totalSlots }, (_, i) => ({
            id: i, teamId: null, isBye: false, matchIndex: Math.floor(i / 2) + 1
        }));
    }

    _distributeByes() {
        let byePlaced = 0;
        for (let i = this.totalSlots - 1; i >= 0 && byePlaced < this.byeCount; i -= 2) {
            this.slots[i].isBye = true;
            byePlaced++;
        }
    }

    _distributeTeams(teams = this.teams) {
        const shuffled = [...teams];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        let idx = 0;
        for (let i = 0; i < this.totalSlots; i++) {
            if (!this.slots[i].isBye && idx < shuffled.length) {
                this.slots[i].teamId = shuffled[idx].teamId;
                idx++;
            }
        }
    }

    _distributeTeamsOrdered(teams = this.teams) {
        let idx = 0;
        for (let i = 0; i < this.totalSlots; i++) {
            if (!this.slots[i].isBye && idx < teams.length) {
                this.slots[i].teamId = teams[idx].teamId;
                idx++;
            }
        }
    }

    getData() {
        const matches = [];
        const totalMatches = Math.floor(this.totalSlots / 2);
        for (let i = 0; i < totalMatches; i++) {
            const s1 = this.slots[i * 2], s2 = this.slots[i * 2 + 1];
            if (s1 && s2) {
                matches.push({
                    stageLevel: 1, matchIndex: i + 1,
                    team1Id: s1.teamId || null, team2Id: s2.teamId || null,
                    slot1Id: s1.id, slot2Id: s2.id,
                    isBye1: s1.isBye || false, isBye2: s2.isBye || false
                });
            }
        }
        for (let r = 2; r <= this.rounds; r++) {
            for (let i = 0; i < Math.pow(2, this.rounds - r); i++) {
                matches.push({
                    stageLevel: r, matchIndex: i + 1,
                    team1Id: null, team2Id: null,
                    isBye1: false, isBye2: false
                });
            }
        }
        if (this.totalSlots >= 4) {
            matches.push({
                stageLevel: this.rounds, matchIndex: 2,
                team1Id: null, team2Id: null,
                isBye1: false, isBye2: false, isThirdPlace: true
            });
        }
        return {
            slots: this.slots.map(s => ({ id: s.id, teamId: s.teamId, isBye: s.isBye })),
            matches
        };
    }

    _getTeamName(teamId) {
        if (!teamId) return '???';
        if (this.teamNames[teamId]) return this.teamNames[teamId];
        const team = this.teams.find(t => t.teamId === teamId);
        if (team) {
            const name = team.displayName || getTeamNameFromTeam(team);
            this.teamNames[teamId] = name;
            return name;
        }
        return `Команда ${teamId}`;
    }

    _getMatchTeamName(match, side) {
        const isByeKey = side === 'team1' ? 'isBye1' : 'isBye2';
        const teamIdKey = side === 'team1' ? 'team1Id' : 'team2Id';
        const isBye = match[isByeKey] || match.isBye || false;

        let name;
        if (match[teamIdKey]) {
            name = getTeamNameFromMatch(match, side, this.teamNames);
        } else {
            name = '???';
        }

        if (isBye && (name === '???' || !match[teamIdKey])) {
            return 'BYE';
        }

        return name || '???';
    }

    _getMatchTeamNameWithLinks(match, side) {
    const playersKey = side === 'team1' ? 'team1Players' : 'team2Players';
    const teamIdKey = side === 'team1' ? 'team1Id' : 'team2Id';
    const isByeKey = side === 'team1' ? 'isBye1' : 'isBye2';

    const players = this.parseTeamPlayers(match[playersKey]);

    // Если есть игроки — возвращаем массив ссылок
    if (players && players.length > 0) {
        return players.map(p => {
            const a = document.createElement('a');
            a.href = `profile.html?id=${p.userId}`;
            a.target = '_blank';
            a.style.color = 'inherit';
            a.style.textDecoration = 'none';
            a.title = `${p.name || ''} ${p.surname || ''}`.trim();
            a.textContent = p.surname || p.name || 'Игрок';
            return a;
        });
    }

    // Иначе возвращаем строку (BYE, подсказка, "???" и т.д.)
    const teamId = match[teamIdKey];
    const isBye = match[isByeKey] || match.isBye || false;

    if (isBye && !teamId) return 'BYE';
    if (teamId && this.teamNames[teamId]) return this.teamNames[teamId];
    if (teamId) return `Команда ${teamId}`;
    return '???';
}

    _getSourceLabel(source, sourceMatchId) {
        if (!source) return null;
        if (source === 'team' || source === 'bye') return null;
        
        const matchNum = sourceMatchId || '?';
        
        switch (source) {
            case 'winner': return `Поб. M${matchNum}`;
            case 'loser': return `Проиг. M${matchNum}`;
            default: return `M${matchNum}`;
        }
    }

    // ============================================================
    // ПУБЛИЧНЫЕ МЕТОДЫ РЕНДЕРА
    // ============================================================

    render(teams = this.teams) {
        if (!this.container) return;
        this.teams = teams || this.teams;
        this._initSlots();
        this._distributeByes();
        if (this.distributionMode === 'ordered') this._distributeTeamsOrdered();
        else this._distributeTeams();
        this._buildDOM();
    }

    renderStatic(qualifiedTeams) {
        if (!this.container) return;
        const ordered = qualifiedTeams.filter(t => t.teamId).map(t => ({ teamId: t.teamId }));
        this._initSlots();
        let idx = 0;
        for (let i = 0; i < this.totalSlots; i++) {
            if (!this.slots[i].isBye && idx < ordered.length) {
                this.slots[i].teamId = ordered[idx].teamId;
                idx++;
            }
        }
        this._buildDOM();
    }

    renderStaticWithSlots(slots) {
        if (!this.container) return;
        this.slots = slots.map(s => ({
            id: s.id, teamId: s.teamId || null, isBye: s.isBye || false,
            matchIndex: Math.floor(s.id / 2) + 1, teamData: s.teamData || null
        }));
        this.totalSlots = slots.length;
        this.rounds = Math.log2(this.totalSlots);
        this.byeCount = slots.filter(s => s.isBye).length;
        this.slots.forEach(s => {
            if (s.teamId && s.teamData?.displayName && !this.teamNames[s.teamId]) {
                this.teamNames[s.teamId] = s.teamData.displayName;
            }
        });
        this._buildDOM();
    }

        renderFromMatches(matches) {
        if (!this.container) return;
        this.matches = matches;
        
        const hasBracket = matches.some(m => m.bracket === 'losers' || m.bracket === 'semifinal');
        if (hasBracket) {
            this._buildDOMFromMatchesDE();
        } else {
            this._buildDOMFromMatches();
        }
        console.log('Container HTML length:', this.container.innerHTML.length);
        console.log('Has links:', this.container.innerHTML.includes('profile.html'));
    }
    // ============================================================
    // ПОСТРОЕНИЕ DOM ИЗ СЛОТОВ
    // ============================================================

    _buildDOM() {
        this.clear();
        const wrapper = this._createWrapper();
        const grid = this._createGrid();

        for (let r = 0; r < this.rounds; r++) {
            const roundDiv = this._createRound(r);
            const matchesDiv = this._createMatchesContainer();
            const isLastRound = r === this.rounds - 1;

            if (isLastRound && this.totalSlots >= 4) {
                const finalGroup = this._createFinalGroup();
                const { t1, t2, b1, b2, n1, n2 } = this._getMatchData(r, 0);
                finalGroup.appendChild(this._createMatchDOM(r, 0, t1, t2, b1, b2, n1, n2, 'bracket-cell-final'));
                finalGroup.appendChild(this._createThirdPlaceDOM());
                matchesDiv.appendChild(finalGroup);
            } else {
                const curMatches = Math.pow(2, this.rounds - r - 1);
                for (let m = 0; m < curMatches; m++) {
                    const { t1, t2, b1, b2, n1, n2 } = this._getMatchData(r, m);
                    matchesDiv.appendChild(this._createMatchDOM(r, m, t1, t2, b1, b2, n1, n2));
                }
            }

            roundDiv.appendChild(matchesDiv);
            grid.appendChild(roundDiv);
        }

        wrapper.appendChild(grid);
        this.container.appendChild(wrapper);
        if (this.interactive) this._enableDragAndDrop();
    }

    // ============================================================
    // ПОСТРОЕНИЕ DOM ИЗ МАТЧЕЙ БД (Олимпийская система)
    // ============================================================

    _buildDOMFromMatches() {
        this.clear();
        if (!this.matches?.length) {
            this.container.innerHTML = '<div class="card" style="text-align:center;padding:40px;">Нет матчей</div>';
            return;
        }

        const maxLevel = Math.max(...this.matches.map(m => m.stageLevel || 0));
        const roundsMap = {};
        this.matches.forEach(m => {
            const lvl = m.stageLevel || 0;
            if (!roundsMap[lvl]) roundsMap[lvl] = [];
            roundsMap[lvl].push(m);
        });

        const levels = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);
        const wrapper = this._createWrapper();
        const grid = this._createGrid(levels.length);

        levels.forEach(level => {
            const isFinal = level === maxLevel;
            const roundDiv = this._createRoundStatic(level, maxLevel, isFinal);
            const matchesDiv = this._createMatchesContainer();
            const sorted = [...(roundsMap[level] || [])].sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0));

            if (isFinal && sorted.length > 1) {
                const finalGroup = this._createFinalGroup();
                sorted.forEach(match => {
                    if (match.matchIndex === 2) {
                        finalGroup.appendChild(this._createThirdPlaceDOM());
                    } else {
                        finalGroup.appendChild(this._createMatchFromDB(match, isFinal, maxLevel));
                    }
                });
                matchesDiv.appendChild(finalGroup);
            } else if (isFinal && sorted.length === 1 && sorted[0].matchIndex === 2) {
                const finalGroup = this._createFinalGroup();
                finalGroup.appendChild(this._createThirdPlaceDOM());
                matchesDiv.appendChild(finalGroup);
            } else {
                sorted.forEach(match => {
                    matchesDiv.appendChild(this._createMatchFromDB(match, isFinal, maxLevel));
                });
            }

            roundDiv.appendChild(matchesDiv);
            grid.appendChild(roundDiv);
        });

        wrapper.appendChild(grid);
        this.container.innerHTML = '';
        this.container.appendChild(wrapper);
    }

    // ============================================================
    // ПОСТРОЕНИЕ DOM ДЛЯ DOUBLE ELIMINATION
    // ============================================================

    _buildDOMFromMatchesDE() {
        this.clear();
        if (!this.matches?.length) {
            this.container.innerHTML = '<div class="card" style="text-align:center;padding:40px;">Нет матчей</div>';
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; gap: 32px; overflow-x: auto; padding: 16px 0;';

        const winnersMatches = this.matches.filter(m => m.bracket === 'winners');
        const losersMatches = this.matches.filter(m => m.bracket === 'losers');
        const semifinals = this.matches.filter(m => m.bracket === 'semifinal');
        const thirdPlace = this.matches.filter(m => m.bracket === 'third_place');
        const final = this.matches.filter(m => m.bracket === 'final');

        const groupByStage = (list) => {
            const map = {};
            list.forEach(m => {
                const s = m.stageLevel || 0;
                if (!map[s]) map[s] = [];
                map[s].push(m);
            });
            return Object.keys(map).map(Number).sort((a, b) => a - b);
        };

        const wStages = groupByStage(winnersMatches);
        const lStages = groupByStage(losersMatches);
        const maxStage = Math.max(
            wStages.length > 0 ? Math.max(...wStages) : 0,
            lStages.length > 0 ? Math.max(...lStages.map(Number)) : 0
        );
        
        let displayNum = 1;
        const numMap = {};
        
        const isStrategyB = wStages.includes(2) && lStages.length >= 2;
        
        if (isStrategyB) {
            [1, 2].forEach(s => {
                (winnersMatches.filter(m => (m.stageLevel||0) === s).sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0)))
                    .forEach(m => { numMap[m.matchId] = displayNum++; });
            });
            [1, 2].forEach(s => {
                (losersMatches.filter(m => (m.stageLevel||0) === s).sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0)))
                    .forEach(m => { numMap[m.matchId] = displayNum++; });
            });
            for (let s = 3; s <= maxStage; s++) {
                (winnersMatches.filter(m => (m.stageLevel||0) === s).sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0)))
                    .forEach(m => { numMap[m.matchId] = displayNum++; });
                (losersMatches.filter(m => (m.stageLevel||0) === s).sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0)))
                    .forEach(m => { numMap[m.matchId] = displayNum++; });
            }
        } else {
            for (let s = 1; s <= maxStage; s++) {
                (winnersMatches.filter(m => (m.stageLevel||0) === s).sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0)))
                    .forEach(m => { numMap[m.matchId] = displayNum++; });
                (losersMatches.filter(m => (m.stageLevel||0) === s).sort((a,b) => (a.matchIndex||0)-(b.matchIndex||0)))
                    .forEach(m => { numMap[m.matchId] = displayNum++; });
            }
        }
        
        semifinals.sort((a, b) => (a.matchIndex||0) - (b.matchIndex||0)).forEach(m => { numMap[m.matchId] = displayNum++; });
        thirdPlace.forEach(m => { numMap[m.matchId] = displayNum++; });
        final.forEach(m => { numMap[m.matchId] = displayNum++; });

        const getRoundNumber = (bracket, stageLevel) => {
            if (isStrategyB) {
                if (bracket === 'winners' && stageLevel === 1) return 1;
                if (bracket === 'winners' && stageLevel === 2) return 2;
                if (bracket === 'losers' && stageLevel === 1) return 3;
                if (bracket === 'losers' && stageLevel === 2) return 4;
                let roundNum = 5;
                for (let s = 3; s < stageLevel; s++) {
                    if (wStages.includes(s)) roundNum++;
                    if (lStages.includes(s)) roundNum++;
                }
                if (bracket === 'winners') return roundNum;
                if (bracket === 'losers') return roundNum + 1;
                return stageLevel;
            } else {
                if (bracket === 'winners') return stageLevel * 2 - 1;
                if (bracket === 'losers') return stageLevel * 2;
                return stageLevel;
            }
        };

        // === ВЕРХНЯЯ СЕТКА ===
        if (winnersMatches.length > 0) {
            const wSection = document.createElement('div');
            
            const wTitle = document.createElement('div');
            wTitle.style.cssText = 'text-align:center;font-weight:700;font-size:1.1rem;color:#c49a2c;margin-bottom:12px;';
            wTitle.textContent = 'Верхняя сетка';
            wSection.appendChild(wTitle);
            
            const wGrid = document.createElement('div');
            wGrid.className = 'bracket-grid';
            wGrid.style.gridTemplateColumns = `repeat(${wStages.length}, 1fr)`;
            
            wStages.forEach(stage => {
                const roundDiv = document.createElement('div');
                roundDiv.className = 'bracket-round';
                
                const roundNum = getRoundNumber('winners', stage);
                const label = document.createElement('div');
                label.className = 'bracket-round-label';
                label.textContent = `Раунд ${roundNum}`;
                roundDiv.appendChild(label);
                
                const matchesDiv = document.createElement('div');
                matchesDiv.className = 'bracket-matches';
                
                const sorted = winnersMatches
                    .filter(m => (m.stageLevel || 0) === stage)
                    .sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0));
                
                sorted.forEach(match => {
                    matchesDiv.appendChild(this._createMatchFromDBDE(match, numMap));
                });
                
                roundDiv.appendChild(matchesDiv);
                wGrid.appendChild(roundDiv);
            });
            
            wSection.appendChild(wGrid);
            wrapper.appendChild(wSection);
        }

        // === НИЖНЯЯ СЕТКА ===
        if (losersMatches.length > 0) {
            const lSection = document.createElement('div');
            
            const lTitle = document.createElement('div');
            lTitle.style.cssText = 'text-align:center;font-weight:700;font-size:1.1rem;color:#5f6b7a;margin-bottom:12px;';
            lTitle.textContent = 'Нижняя сетка';
            lSection.appendChild(lTitle);
            
            const lGrid = document.createElement('div');
            lGrid.className = 'bracket-grid';
            lGrid.style.gridTemplateColumns = `repeat(${lStages.length}, 1fr)`;
            
            lStages.forEach(stage => {
                const roundDiv = document.createElement('div');
                roundDiv.className = 'bracket-round';
                
                const roundNum = getRoundNumber('losers', stage);
                const label = document.createElement('div');
                label.className = 'bracket-round-label';
                label.textContent = `Раунд ${roundNum}`;
                roundDiv.appendChild(label);
                
                const matchesDiv = document.createElement('div');
                matchesDiv.className = 'bracket-matches';
                
                const sorted = losersMatches
                    .filter(m => (m.stageLevel || 0) === stage)
                    .sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0));
                
                sorted.forEach(match => {
                    matchesDiv.appendChild(this._createMatchFromDBDE(match, numMap));
                });
                
                roundDiv.appendChild(matchesDiv);
                lGrid.appendChild(roundDiv);
            });
            
            lSection.appendChild(lGrid);
            wrapper.appendChild(lSection);
        }

        // === ФИНАЛ ЧЕТЫРЁХ ===
        if (semifinals.length > 0 || final.length > 0 || thirdPlace.length > 0) {
            const ffSection = document.createElement('div');
            
            const ffTitle = document.createElement('div');
            ffTitle.style.cssText = 'text-align:center;font-weight:700;font-size:1.1rem;color:#c49a2c;margin-bottom:12px;';
            ffTitle.textContent = 'Финал четырёх';
            ffSection.appendChild(ffTitle);
            
            const ffGrid = document.createElement('div');
            ffGrid.className = 'bracket-grid';
            ffGrid.style.gridTemplateColumns = '1fr 1fr 1fr';
            
            // Полуфиналы
            const sfCol = document.createElement('div');
            sfCol.className = 'bracket-round';
            const sfLabel = document.createElement('div');
            sfLabel.className = 'bracket-round-label';
            sfLabel.textContent = 'Полуфиналы';
            sfCol.appendChild(sfLabel);
            const sfMatches = document.createElement('div');
            sfMatches.className = 'bracket-matches';
            semifinals.sort((a, b) => (a.matchIndex||0) - (b.matchIndex||0)).forEach(m => {
                sfMatches.appendChild(this._createMatchFromDBDE(m, numMap));
            });
            sfCol.appendChild(sfMatches);
            ffGrid.appendChild(sfCol);
            
            // За 3-4 место
            const tpCol = document.createElement('div');
            tpCol.className = 'bracket-round';
            const tpLabel = document.createElement('div');
            tpLabel.className = 'bracket-round-label';
            tpLabel.textContent = 'За 3-4 место';
            tpCol.appendChild(tpLabel);
            const tpMatches = document.createElement('div');
            tpMatches.className = 'bracket-matches';
            thirdPlace.forEach(m => {
                tpMatches.appendChild(this._createMatchFromDBDE(m, numMap));
            });
            tpCol.appendChild(tpMatches);
            ffGrid.appendChild(tpCol);
            
            // Финал
            const fCol = document.createElement('div');
            fCol.className = 'bracket-round';
            const fLabel = document.createElement('div');
            fLabel.className = 'bracket-round-label bracket-round-label-final';
            fLabel.textContent = '🏆 Финал';
            fCol.appendChild(fLabel);
            const fMatches = document.createElement('div');
            fMatches.className = 'bracket-matches';
            final.forEach(m => {
                fMatches.appendChild(this._createMatchFromDBDE(m, numMap));
            });
            fCol.appendChild(fMatches);
            ffGrid.appendChild(fCol);
            
            ffSection.appendChild(ffGrid);
            wrapper.appendChild(ffSection);
        }

        this.container.innerHTML = '';
        this.container.appendChild(wrapper);
    }

    // ============================================================
    // СОЗДАНИЕ ЯЧЕЙКИ МАТЧА DE С ИГРОКАМИ-ССЫЛКАМИ И СЕТАМИ
    // ============================================================
_createMatchFromDBDE(match, numMap) {
    const isBye1 = match.isBye1 || false;
    const isBye2 = match.isBye2 || false;
    const finished = match.winnerId !== null;
    const w1 = finished && match.winnerId === match.team1Id;
    const w2 = finished && match.winnerId === match.team2Id;

    const div = document.createElement('div');
    div.className = 'bracket-cell';

    // Номер матча
    const displayNum = numMap[match.matchId] || match.matchId;
    const numDiv = document.createElement('div');    numDiv.style.cssText = 'font-size:0.6rem;color:#8e9aab;text-align:center;margin-bottom:2px;';
    numDiv.textContent = `M${displayNum}`;
    div.appendChild(numDiv);

    // Команда 1
    const team1Div = document.createElement('div');
    team1Div.className = `bracket-team ${isBye1 && !match.team1Id ? 'bracket-team-bye' : ''} ${w1 ? 'bracket-team-winner' : ''}`;

    const score1 = document.createElement('span');
    score1.className = 'bracket-score';
    score1.textContent = finished ? (match.setsTeam1 || 0) : '';
    team1Div.appendChild(score1);

    const name1Span = document.createElement('span');
    name1Span.className = 'bracket-team-name';

    if (match.team1Id) {
        const links = this._getMatchTeamNameWithLinks(match, 'team1');
        if (Array.isArray(links)) {
            links.forEach((a, i) => {
                name1Span.appendChild(a);
                if (i < links.length - 1) {
                    name1Span.appendChild(document.createTextNode(' · '));
                }
            });
        } else {
            name1Span.textContent = links || '???';
        }
    } else if (match.team1Source === 'bye' || isBye1) {
        name1Span.textContent = 'BYE';
    } else if (match.team1Source && match.team1SourceMatchId) {
        const srcNum = numMap[match.team1SourceMatchId] || match.team1SourceMatchId;
        name1Span.textContent = this._getSourceLabel(match.team1Source, srcNum) || '???';
        name1Span.className += ' bracket-team-name-placeholder';
    } else {
        name1Span.textContent = '???';
        name1Span.className += ' bracket-team-name-placeholder';
    }
    team1Div.appendChild(name1Span);
    div.appendChild(team1Div);

    // VS со стрелочкой
    const vsDiv = document.createElement('div');
    vsDiv.className = 'bracket-vs';
    vsDiv.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;';
    
    const vsText = document.createElement('span');
    vsText.textContent = 'VS';
    vsDiv.appendChild(vsText);
    div.appendChild(vsDiv);

    // Команда 2
    const team2Div = document.createElement('div');
    team2Div.className = `bracket-team ${isBye2 && !match.team2Id ? 'bracket-team-bye' : ''} ${w2 ? 'bracket-team-winner' : ''}`;

    const score2 = document.createElement('span');
    score2.className = 'bracket-score';
    score2.textContent = finished ? (match.setsTeam2 || 0) : '';
    team2Div.appendChild(score2);

    const name2Span = document.createElement('span');
    name2Span.className = 'bracket-team-name';

    if (match.team2Id) {
        const links = this._getMatchTeamNameWithLinks(match, 'team2');
        if (Array.isArray(links)) {
            links.forEach((a, i) => {
                name2Span.appendChild(a);
                if (i < links.length - 1) {
                    name2Span.appendChild(document.createTextNode(' · '));
                }
            });
        } else {
            name2Span.textContent = links || '???';
        }
    } else if (match.team2Source === 'bye' || isBye2) {
        name2Span.textContent = 'BYE';
    } else if (match.team2Source && match.team2SourceMatchId) {
        const srcNum = numMap[match.team2SourceMatchId] || match.team2SourceMatchId;
        name2Span.textContent = this._getSourceLabel(match.team2Source, srcNum) || '???';
        name2Span.className += ' bracket-team-name-placeholder';
    } else {
        name2Span.textContent = '???';
        name2Span.className += ' bracket-team-name-placeholder';
    }
    team2Div.appendChild(name2Span);
    div.appendChild(team2Div);

    // Сеты и стрелочка
    let setsDiv = null;
    let arrow = null;
    
    if (finished && this.matchSetsMap && this.matchSetsMap[match.matchId]) {
        const sets = this.matchSetsMap[match.matchId];
        setsDiv = document.createElement('div');
        setsDiv.className = 'match-set-scores';
        setsDiv.style.cssText = 'display:none;margin-top:4px;flex-wrap:wrap;gap:4px;justify-content:center;';

        sets.forEach((s, i) => {
            const span = document.createElement('span');
            span.style.cssText = 'font-size:0.7rem;color:#8e9aab;background:#f5f3ef;border:1px solid #e8e2d5;padding:2px 6px;border-radius:4px;';
            span.innerHTML = `${i+1}. <b style="color:${s.winner===1?'#c49a2c':'#5f6b7a'}">${s.team1Score}</b>:<b style="color:${s.winner===2?'#c49a2c':'#5f6b7a'}">${s.team2Score}</b>`;
            setsDiv.appendChild(span);
        });
        div.appendChild(setsDiv);

        // Стрелочка слева от VS
        arrow = document.createElement('i');
        arrow.className = 'fas fa-chevron-down bracket-score-arrow';
        arrow.style.cssText = 'font-size:0.6rem;color:#8e9aab;transition:transform 0.2s;';
        vsDiv.insertBefore(arrow, vsText);
        vsDiv.style.cursor = 'pointer';
        vsDiv.title = 'Нажмите для просмотра по сетам';

        vsDiv.addEventListener('click', function(e) {
            e.stopPropagation();
            if (setsDiv.style.display === 'none') {
                setsDiv.style.display = 'flex';
                if (arrow) arrow.style.transform = 'rotate(180deg)';
            } else {
                setsDiv.style.display = 'none';
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            }
        });
    }

    return div;
}


    // ============================================================
    // ФАБРИКИ DOM-ЭЛЕМЕНТОВ
    // ============================================================

    _createWrapper() {
        const w = document.createElement('div');
        w.className = 'bracket-wrapper';
        return w;
    }

    _createGrid(cols) {
        const g = document.createElement('div');
        g.className = 'bracket-grid';
        g.style.gridTemplateColumns = `repeat(${cols || this.rounds}, 1fr)`;
        return g;
    }

    _createRound(r) {
        const d = document.createElement('div');
        d.className = 'bracket-round';
        const label = document.createElement('div');
        label.className = `bracket-round-label ${r === this.rounds - 1 ? 'bracket-round-label-final' : ''}`;
        label.textContent = r === this.rounds - 1 ? 'Финал' : `1/${Math.pow(2, this.rounds - r - 1)} финала`;
        d.appendChild(label);
        return d;
    }

    _createRoundStatic(level, maxLevel, isFinal) {
        const d = document.createElement('div');
        d.className = 'bracket-round';
        const label = document.createElement('div');
        label.className = `bracket-round-label ${isFinal ? 'bracket-round-label-final' : ''}`;
        label.textContent = getRoundName(level, maxLevel);
        d.appendChild(label);
        return d;
    }

    _createMatchesContainer() {
        const d = document.createElement('div');
        d.className = 'bracket-matches';
        return d;
    }

    _createFinalGroup() {
        const d = document.createElement('div');
        d.className = 'bracket-final-group';
        return d;
    }

    _getMatchData(r, m) {
        if (r === 0) {
            const s1 = this.slots[m * 2], s2 = this.slots[m * 2 + 1];
            const t1 = s1?.teamId || null, t2 = s2?.teamId || null;
            const b1 = s1?.isBye || false, b2 = s2?.isBye || false;
            
            const n1 = (b1 && !t1) ? 'BYE' : (t1 ? this._getTeamName(t1) : (b1 ? 'BYE' : '???'));
            const n2 = (b2 && !t2) ? 'BYE' : (t2 ? this._getTeamName(t2) : (b2 ? 'BYE' : '???'));
            
            const matchNum = m + 1;
            
            return { t1, t2, b1, b2, n1, n2, matchNum };
        }
        return { t1: null, t2: null, b1: false, b2: false, n1: '—', n2: '—', matchNum: null };
    }

    _createMatchDOM(r, m, team1Id, team2Id, isBye1, isBye2, name1, name2, extraClass = '') {
        const div = document.createElement('div');
        div.className = 'bracket-cell ' + extraClass;

        const isFirst = r === 0;
        const drag1 = (this.interactive && isFirst && team1Id && !isBye1) ? 'true' : 'false';
        const drag2 = (this.interactive && isFirst && team2Id && !isBye2) ? 'true' : 'false';

        const displayName1 = (isBye1 && name1 === '???') ? 'BYE' : name1;
        const displayName2 = (isBye2 && name2 === '???') ? 'BYE' : name2;

        const r1 = `bracket-team ${isBye1 ? 'bracket-team-bye' : ''} ${!team1Id && !isBye1 ? 'bracket-team-placeholder' : ''}`;
        const r2 = `bracket-team ${isBye2 ? 'bracket-team-bye' : ''} ${!team2Id && !isBye2 ? 'bracket-team-placeholder' : ''}`;
        const n1c = `bracket-team-name ${!team1Id && !isBye1 ? 'bracket-team-name-placeholder' : ''}`;
        const n2c = `bracket-team-name ${!team2Id && !isBye2 ? 'bracket-team-name-placeholder' : ''}`;

        const matchNum = m + 1;
        const matchLabel = `<div style="font-size: 0.6rem; color: #8e9aab; text-align: center; margin-bottom: 2px;">M${matchNum}</div>`;

        let slotLabel1 = '';
        let slotLabel2 = '';
        
        if (isFirst) {
            if (!team1Id && !isBye1) {
                slotLabel1 = '<span style="font-size: 0.55rem; color: #8e9aab; display: block;">Команда</span>';
            }
            if (!team2Id && !isBye2) {
                slotLabel2 = '<span style="font-size: 0.55rem; color: #8e9aab; display: block;">Команда</span>';
            }
        } else {
            const prevMatch1 = (m * 2) + 1;
            const prevMatch2 = (m * 2) + 2;
            
            slotLabel1 = `<span style="font-size: 0.55rem; color: #8e9aab; display: block;">Поб. M${prevMatch1}</span>`;
            slotLabel2 = `<span style="font-size: 0.55rem; color: #8e9aab; display: block;">Поб. M${prevMatch2}</span>`;
        }

        div.innerHTML = `
            ${matchLabel}
            <div class="${r1}" draggable="${drag1}" data-team-id="${team1Id || ''}" data-slot-index="${m * 2}" data-round="${r}">
                <span class="bracket-score"></span>
                <span class="${n1c}">${displayName1}</span>
                ${slotLabel1}
            </div>
            <div class="bracket-vs">VS</div>
            <div class="${r2}" draggable="${drag2}" data-team-id="${team2Id || ''}" data-slot-index="${m * 2 + 1}" data-round="${r}">
                <span class="bracket-score"></span>
                <span class="${n2c}">${displayName2}</span>
                ${slotLabel2}
            </div>
        `;
        return div;
    }

    _createThirdPlaceDOM() {
        const div = document.createElement('div');
        div.className = 'bracket-cell bracket-cell-third';

        let n1 = 'Проигравший 1/2', n2 = 'Проигравший 1/2';
        let r1c = 'bracket-team bracket-team-placeholder';
        let r2c = 'bracket-team bracket-team-placeholder';
        let n1c = 'bracket-team-name bracket-team-name-placeholder';
        let n2c = 'bracket-team-name bracket-team-name-placeholder';
        let s1 = '', s2 = '';

        if (this.matches?.length) {
            const thirdMatch = this.matches.find(m => m.stageLevel === this.rounds && m.matchIndex === 2);
            if (thirdMatch) {
                const finished = thirdMatch.winnerId !== null;
                const w1 = finished && thirdMatch.winnerId === thirdMatch.team1Id;
                const w2 = finished && thirdMatch.winnerId === thirdMatch.team2Id;
                const isBye1 = thirdMatch.isBye1 || false;
                const isBye2 = thirdMatch.isBye2 || false;

                const rawName1 = thirdMatch.team1Id ? this._getMatchTeamName(thirdMatch, 'team1') : '???';
                const rawName2 = thirdMatch.team2Id ? this._getMatchTeamName(thirdMatch, 'team2') : '???';

                if (rawName1 !== '???' || rawName2 !== '???') {
                    n1 = rawName1 === '???' ? 'Проигравший 1/2' : rawName1;
                    n2 = rawName2 === '???' ? 'Проигравший 1/2' : rawName2;

                    r1c = `bracket-team ${isBye1 ? 'bracket-team-bye' : ''} ${finished && w1 ? 'bracket-team-winner' : ''} ${n1 === 'Проигравший 1/2' ? 'bracket-team-placeholder' : ''}`;
                    r2c = `bracket-team ${isBye2 ? 'bracket-team-bye' : ''} ${finished && w2 ? 'bracket-team-winner' : ''} ${n2 === 'Проигравший 1/2' ? 'bracket-team-placeholder' : ''}`;
                    n1c = `bracket-team-name ${n1 === 'Проигравший 1/2' ? 'bracket-team-name-placeholder' : ''}`;
                    n2c = `bracket-team-name ${n2 === 'Проигравший 1/2' ? 'bracket-team-name-placeholder' : ''}`;
                }

                s1 = finished ? (thirdMatch.setsTeam1 || 0) : '';
                s2 = finished ? (thirdMatch.setsTeam2 || 0) : '';
            }
        }

        div.innerHTML = `
            <div class="${r1c}">
                <span class="bracket-score">${s1}</span>
                <span class="${n1c}">${n1}</span>
            </div>
            <div class="bracket-vs">VS</div>
            <div class="${r2c}">
                <span class="bracket-score">${s2}</span>
                <span class="${n2c}">${n2}</span>
            </div>
        `;
        return div;
    }

_createMatchFromDB(match, isFinal, maxLevel) {
    const isThird = match.bracket === 'third_place';
    const isFinalMatch = match.bracket === 'final';
    const isSemifinal = match.bracket === 'semifinal';
    const isBye1 = match.isBye1 || match.isBye || false;
    const isBye2 = match.isBye2 || match.isBye || false;
    const finished = match.winnerId !== null;
    const w1 = finished && match.winnerId === match.team1Id;
    const w2 = finished && match.winnerId === match.team2Id;

    const div = document.createElement('div');
    div.className = 'bracket-cell' + 
        (isThird ? ' bracket-cell-third' : '') + 
        (isFinalMatch ? ' bracket-cell-final' : '') +
        (isSemifinal ? ' bracket-cell-semifinal' : '');

    // Номер матча
    const matchLabel = match.matchId || match.dbMatchId || '';
    const numDiv = document.createElement('div');
    numDiv.style.cssText = 'font-size:0.6rem;color:#8e9aab;text-align:center;margin-bottom:2px;';
    numDiv.textContent = `M${matchLabel}`;
    div.appendChild(numDiv);

    // Команда 1
    const r1 = `bracket-team ${isBye1 ? 'bracket-team-bye' : ''} ${finished && w1 ? 'bracket-team-winner' : ''}`;
    const team1Div = document.createElement('div');
    team1Div.className = r1;

    const s1 = finished ? (match.setsTeam1 || 0) : '';
    const score1 = document.createElement('span');
    score1.className = 'bracket-score';
    score1.textContent = s1;
    team1Div.appendChild(score1);

    const name1Span = document.createElement('span');
    name1Span.className = 'bracket-team-name';

    if (match.team1Id) {
        const links = this._getMatchTeamNameWithLinks(match, 'team1');
        if (Array.isArray(links)) {
            links.forEach((a, i) => {
                name1Span.appendChild(a);
                if (i < links.length - 1) {
                    name1Span.appendChild(document.createTextNode(' · '));
                }
            });
        } else {
            name1Span.textContent = links || '???';
        }
    } else if (match.team1Source && match.team1SourceMatchId) {
        name1Span.textContent = this._getSourceLabel(match.team1Source, match.team1SourceMatchId) || '???';
        name1Span.className += ' bracket-team-name-placeholder';
    } else {
        name1Span.textContent = '???';
        name1Span.className += ' bracket-team-name-placeholder';
    }
    team1Div.appendChild(name1Span);
    div.appendChild(team1Div);

    // VS со стрелочкой
    const vsDiv = document.createElement('div');
    vsDiv.className = 'bracket-vs';
    vsDiv.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;';
    
    const vsText = document.createElement('span');
    vsText.textContent = 'VS';
    vsDiv.appendChild(vsText);
    div.appendChild(vsDiv);

    // Команда 2
    const r2 = `bracket-team ${isBye2 ? 'bracket-team-bye' : ''} ${finished && w2 ? 'bracket-team-winner' : ''}`;
    const team2Div = document.createElement('div');
    team2Div.className = r2;

    const s2 = finished ? (match.setsTeam2 || 0) : '';
    const score2 = document.createElement('span');
    score2.className = 'bracket-score';
    score2.textContent = s2;
    team2Div.appendChild(score2);

    const name2Span = document.createElement('span');
    name2Span.className = 'bracket-team-name';

    if (match.team2Id) {
        const links = this._getMatchTeamNameWithLinks(match, 'team2');
        if (Array.isArray(links)) {
            links.forEach((a, i) => {
                name2Span.appendChild(a);
                if (i < links.length - 1) {
                    name2Span.appendChild(document.createTextNode(' · '));
                }
            });
        } else {
            name2Span.textContent = links || '???';
        }
    } else if (match.team2Source && match.team2SourceMatchId) {
        name2Span.textContent = this._getSourceLabel(match.team2Source, match.team2SourceMatchId) || '???';
        name2Span.className += ' bracket-team-name-placeholder';
    } else {
        name2Span.textContent = '???';
        name2Span.className += ' bracket-team-name-placeholder';
    }
    team2Div.appendChild(name2Span);
    div.appendChild(team2Div);

    // Сеты и стрелочка
    let setsDiv = null;
    let arrow = null;
    
    if (finished && this.matchSetsMap && this.matchSetsMap[match.matchId]) {
        const sets = this.matchSetsMap[match.matchId];
        setsDiv = document.createElement('div');
        setsDiv.className = 'match-set-scores';
        setsDiv.style.cssText = 'display:none;margin-top:4px;flex-wrap:wrap;gap:4px;justify-content:center;';

        sets.forEach((s, i) => {
            const span = document.createElement('span');
            span.style.cssText = 'font-size:0.7rem;color:#8e9aab;background:#f5f3ef;border:1px solid #e8e2d5;padding:2px 6px;border-radius:4px;';
            span.innerHTML = `${i+1}. <b style="color:${s.winner===1?'#c49a2c':'#5f6b7a'}">${s.team1Score}</b>:<b style="color:${s.winner===2?'#c49a2c':'#5f6b7a'}">${s.team2Score}</b>`;
            setsDiv.appendChild(span);
        });
        div.appendChild(setsDiv);

        // Стрелочка слева от VS
        arrow = document.createElement('i');
        arrow.className = 'fas fa-chevron-down bracket-score-arrow';
        arrow.style.cssText = 'font-size:0.6rem;color:#8e9aab;transition:transform 0.2s;';
        vsDiv.insertBefore(arrow, vsText);
        vsDiv.style.cursor = 'pointer';
        vsDiv.title = 'Нажмите для просмотра по сетам';

        vsDiv.addEventListener('click', function(e) {
            e.stopPropagation();
            if (setsDiv.style.display === 'none') {
                setsDiv.style.display = 'flex';
                if (arrow) arrow.style.transform = 'rotate(180deg)';
            } else {
                setsDiv.style.display = 'none';
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            }
        });
    }

    return div;
}

    renderDEInteractive(teamsList, teamNames, onChange) {
        if (!this.container) return;
        this.teams = teamsList || this.teams;
        this.teamNames = teamNames || {};
        this.interactive = true;
        this.onChange = onChange || null;
        this._initSlots();
        this._distributeByes();
        this._distributeTeams();
        this._buildDOMDE();
    }

    _buildDOMDE() {
        this.clear();
        const wrapper = this._createWrapper();
        const grid = this._createGrid();

        for (let r = 0; r < this.rounds; r++) {
            const roundDiv = this._createRound(r);
            const matchesDiv = this._createMatchesContainer();
            const isLastRound = r === this.rounds - 1;

            if (isLastRound) {
                const { t1, t2, b1, b2, n1, n2 } = this._getMatchData(r, 0);
                matchesDiv.appendChild(this._createMatchDOM(r, 0, t1, t2, b1, b2, n1, n2, 'bracket-cell-final'));
            } else {
                const curMatches = Math.pow(2, this.rounds - r - 1);
                for (let m = 0; m < curMatches; m++) {
                    const { t1, t2, b1, b2, n1, n2 } = this._getMatchData(r, m);
                    matchesDiv.appendChild(this._createMatchDOM(r, m, t1, t2, b1, b2, n1, n2));
                }
            }

            roundDiv.appendChild(matchesDiv);
            grid.appendChild(roundDiv);
        }

        wrapper.appendChild(grid);
        this.container.appendChild(wrapper);
        if (this.interactive) this._enableDragAndDrop();
    }

    // ============================================================
    // DRAG-AND-DROP
    // ============================================================

    _enableDragAndDrop() {
        this.container.querySelectorAll('.bracket-team[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', this._boundDragStart);
            item.addEventListener('dragend', this._boundDragEnd);
        });
        this.container.querySelectorAll('.bracket-team:not(.bracket-team-bye):not(.bracket-team-placeholder)').forEach(item => {
            item.addEventListener('dragover', this._boundDragOver);
            item.addEventListener('dragleave', this._boundDragLeave);
            item.addEventListener('drop', this._boundDrop);
        });
    }

    _updateSlotsFromDOM() {
        this.container.querySelectorAll('.bracket-team').forEach(item => {
            const idx = parseInt(item.dataset.slotIndex);
            const tid = parseInt(item.dataset.teamId);
            if (!isNaN(idx) && this.slots[idx]) this.slots[idx].teamId = tid || null;
        });
        if (this.onChange) this.onChange(this.getData());
    }

    _dragStartHandler(e) {
        this.draggedItem = e.target.closest('.bracket-team');
        if (this.draggedItem) {
            this.draggedItem.classList.add('dragging');
            e.dataTransfer.setData('text/plain', this.draggedItem.dataset.teamId || '');
            e.dataTransfer.effectAllowed = 'move';
        }
    }

    _dragEndHandler(e) {
        const item = e.target.closest('.bracket-team');
        if (item) item.classList.remove('dragging');
        this.draggedItem = null;
        this.container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    _dragOverHandler(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.target.closest('.bracket-team')?.classList.add('drag-over');
    }

    _dragLeaveHandler(e) {
        e.target.closest('.bracket-team')?.classList.remove('drag-over');
    }

    _dropHandler(e) {
        e.preventDefault();
        const target = e.target.closest('.bracket-team');
        target?.classList.remove('drag-over');
        if (!this.draggedItem || !target || this.draggedItem === target || !this.draggedItem.dataset.teamId) return;

        const pa = this.draggedItem.parentNode, pb = target.parentNode;
        const na = this.draggedItem.nextSibling, nb = target.nextSibling;

        if (pa === pb) {
            if (na === target) pa.insertBefore(target, this.draggedItem);
            else if (nb === this.draggedItem) pa.insertBefore(this.draggedItem, target);
            else { pa.insertBefore(this.draggedItem, nb); pa.insertBefore(target, na); }
        } else {
            pa.insertBefore(target, na);
            pb.insertBefore(this.draggedItem, nb);
        }

        this._updateSlotsFromDOM();
        this.draggedItem.classList.remove('dragging');
        this.draggedItem = null;
    }

    // ============================================================
    // ОЧИСТКА И УНИЧТОЖЕНИЕ
    // ============================================================

    clear() {
        if (this.container) this.container.innerHTML = '';
    }

    destroy() {
        if (!this.container) return;
        this.container.querySelectorAll('.bracket-team').forEach(item => {
            item.removeEventListener('dragstart', this._boundDragStart);
            item.removeEventListener('dragend', this._boundDragEnd);
            item.removeEventListener('dragover', this._boundDragOver);
            item.removeEventListener('dragleave', this._boundDragLeave);
            item.removeEventListener('drop', this._boundDrop);
        });
        this.clear();
    }
}

export { BracketRenderer as InteractiveBracket, BracketRenderer as StaticBracket, BracketRenderer as BaseBracket };
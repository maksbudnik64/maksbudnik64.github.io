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
            const name = getTeamNameFromTeam(team);
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
            if (s.teamId && !this.teamNames[s.teamId]) {
                this.teamNames[s.teamId] = s.teamData?.displayName || `Команда ${s.teamId}`;
            }
        });
        this._buildDOM();
    }

    renderFromMatches(matches) {
        if (!this.container) return;
        this.matches = matches;
        this._buildDOMFromMatches();
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
    // ПОСТРОЕНИЕ DOM ИЗ МАТЧЕЙ БД
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
            const n1 = b1 ? 'BYE' : (t1 ? this._getTeamName(t1) : '???');
            const n2 = b2 ? 'BYE' : (t2 ? this._getTeamName(t2) : '???');
            return { t1, t2, b1, b2, n1, n2 };
        }
        return { t1: null, t2: null, b1: false, b2: false, n1: '—', n2: '—' };
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

        div.innerHTML = `
            <div class="${r1}" draggable="${drag1}" data-team-id="${team1Id || ''}" data-slot-index="${m * 2}" data-round="${r}">
                <span class="bracket-score"></span>
                <span class="${n1c}">${displayName1}</span>
            </div>
            <div class="bracket-vs">VS</div>
            <div class="${r2}" draggable="${drag2}" data-team-id="${team2Id || ''}" data-slot-index="${m * 2 + 1}" data-round="${r}">
                <span class="bracket-score"></span>
                <span class="${n2c}">${displayName2}</span>
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
        const isThird = isFinal && match.matchIndex === 2;
        const isFinalMatch = isFinal && match.matchIndex === 1;
        const isBye1 = match.isBye1 || match.isBye || false;
        const isBye2 = match.isBye2 || match.isBye || false;
        const finished = match.winnerId !== null;
        const w1 = finished && match.winnerId === match.team1Id;
        const w2 = finished && match.winnerId === match.team2Id;

        const div = document.createElement('div');
        div.className = 'bracket-cell' + (isThird ? ' bracket-cell-third' : '') + (isFinalMatch ? ' bracket-cell-final' : '');

        const r1 = `bracket-team ${isBye1 ? 'bracket-team-bye' : ''} ${finished && w1 ? 'bracket-team-winner' : ''}`;
        const r2 = `bracket-team ${isBye2 ? 'bracket-team-bye' : ''} ${finished && w2 ? 'bracket-team-winner' : ''}`;
        const n1 = this._getMatchTeamName(match, 'team1');
        const n2 = this._getMatchTeamName(match, 'team2');
        const s1 = finished ? (match.setsTeam1 || 0) : '';
        const s2 = finished ? (match.setsTeam2 || 0) : '';
        const nc1 = `bracket-team-name ${n1 === '???' || n1 === 'BYE' ? 'bracket-team-name-placeholder' : ''}`;
        const nc2 = `bracket-team-name ${n2 === '???' || n2 === 'BYE' ? 'bracket-team-name-placeholder' : ''}`;

        div.innerHTML = `
            <div class="${r1}">
                <span class="bracket-score">${s1}</span>
                <span class="${nc1}">${n1}</span>
            </div>
            <div class="bracket-vs">VS</div>
            <div class="${r2}">
                <span class="bracket-score">${s2}</span>
                <span class="${nc2}">${n2}</span>
            </div>
        `;
        return div;
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
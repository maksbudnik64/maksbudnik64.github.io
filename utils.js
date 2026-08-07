// ============================================================
// ПАРСИНГ ИГРОКОВ
// ============================================================

export function parseTeamPlayers(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && typeof parsed === 'object') return [parsed];
            return [];
        } catch (e) {
            return [];
        }
    }
    if (typeof data === 'object') return [data];
    return [];
}

// ============================================================
// НАЗВАНИЯ КОМАНД
// ============================================================

export function getTeamNameFromMatch(match, side, teamNames = {}) {
    const playersKey = side === 'team1' ? 'team1Players' : 'team2Players';
    const teamIdKey = side === 'team1' ? 'team1Id' : 'team2Id';

    const players = parseTeamPlayers(match[playersKey]);
    if (players && players.length > 0) {
        return players.map(p => p.surname || p.name || 'Игрок').join(' · ');
    }

    const teamId = match[teamIdKey];
    if (teamId && teamNames[teamId]) return teamNames[teamId];
    if (teamId) return `Команда ${teamId}`;
    return '???';
}

export function getTeamNameFromTeam(team) {
    if (!team) return 'Команда';
    let players = [];
    if (team.players) {
        if (Array.isArray(team.players)) players = team.players;
        else if (typeof team.players === 'string') players = parseTeamPlayers(team.players);
    }
    if (players && players.length > 0) {
        return players.map(p => p.surname || p.name || 'Игрок').join(' · ');
    }
    return `Команда ${team.teamId || '?'}`;
}

// ============================================================
// ТУРНИРНАЯ СЕТКА
// ============================================================

export function nextPowerOfTwo(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

export function getRoundName(stageLevel, totalRounds, bracket = null) {
    // Если передан bracket, значит это DE турнир
    if (bracket === 'winners') {
        // Для DE: используем stageLevel как есть, но с префиксом
        if (stageLevel === 1) return 'Раунд 1 (WB)';
        if (stageLevel === 2) return 'Раунд 2 (WB)';
        // Для stageLevel >= 3 считаем раунд
        const roundNum = 5 + (stageLevel - 3) * 2;
        return `Раунд ${roundNum} (WB)`;
    }
    if (bracket === 'losers') {
        if (stageLevel === 1) return 'Раунд 3 (LB)';
        if (stageLevel === 2) return 'Раунд 4 (LB)';
        const roundNum = 6 + (stageLevel - 3) * 2;
        return `Раунд ${roundNum} (LB)`;
    }
    if (bracket === 'semifinal') return 'Полуфинал';
    if (bracket === 'final') return '🏆 Финал';
    if (bracket === 'third_place') return 'За 3-4 место';
    
    // Обычная олимпийская система
    if (totalRounds === 0) return 'Финал';
    const diff = totalRounds - stageLevel;
    if (diff === 0) return 'Финал';
    if (diff === 1) return '1/2 финала';
    if (diff === 2) return '1/4 финала';
    if (diff === 3) return '1/8 финала';
    if (diff === 4) return '1/16 финала';
    if (stageLevel === totalRounds + 1) return 'Матч за 3-е место';
    return `Раунд ${stageLevel}`;
}

export function getGroupLetter(groupName) {
    if (!groupName || groupName === 'all') return 'all';
    const num = parseInt(groupName);
    if (!isNaN(num) && num >= 0) return String.fromCharCode(65 + num);
    return groupName;
}

// ============================================================
// РЕЙТИНГ КОМАНД
// ============================================================

export function getTeamRating(team) {
    const points = team.points || 0;
    const setsWon = team.setsWon || 0;
    const setsLost = team.setsLost || 0;
    const setsDiff = setsWon - setsLost;
    return { points, setsDiff, setsWon, setsLost };
}

export function compareTeamRating(a, b) {
    if ((b.points || 0) !== (a.points || 0)) {
        return (b.points || 0) - (a.points || 0);
    }
    const aDiff = (a.setsWon || 0) - (a.setsLost || 0);
    const bDiff = (b.setsWon || 0) - (b.setsLost || 0);
    return bDiff - aDiff;
}
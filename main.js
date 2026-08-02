import { checkAuth, logout, updateUserCard } from './auth.js'
import { apiGet } from './api.js'
import { createEventCard, formatEventDate } from './eventCards.js'

window.allEventsGlobal = [];

window.getEvent = (eventId) => {
    return window.allEventsGlobal.find(e => e.eventId == eventId) || null;
};

async function initIndexPage() {
    const user = await checkAuth()
    if (!user) {
        window.location.href = 'login.html'
        return
    }
    updateUserCard(user)
    await loadNearestEvent(user)
    await loadProfileMiniCard(user)
    const logoutBtn = document.querySelector('[data-js-logout-button]')
    if (logoutBtn) logoutBtn.addEventListener('click', logout)
    
    // Проверяем якорь после загрузки
    checkEventAnchor()
}

async function loadNearestEvent(user) {
    const mainBoard = document.querySelector('.mainBoard');
    if (!mainBoard) return;

    const nearestGameCard = mainBoard.querySelector('.card:first-child');
    if (!nearestGameCard) return;

    try {
        const { events } = await apiGet('/events');
        window.allEventsGlobal = events;

        const now = new Date();

        const upcoming = events
            .filter(e => {
                let datePart;
                if (e.eventDate && e.eventDate.includes('T')) {
                    const d = new Date(e.eventDate);
                    datePart = d.getFullYear() + '-' + 
                               String(d.getMonth() + 1).padStart(2, '0') + '-' + 
                               String(d.getDate()).padStart(2, '0');
                } else {
                    datePart = e.eventDate;
                }
                
                const eventDate = new Date(datePart + 'T' + (e.eventTime || '00:00'));
                return eventDate > now && e.status !== 'cancelled';
            })
            .sort((a, b) => {
                const parseDate = (e) => {
                    let dp;
                    if (e.eventDate && e.eventDate.includes('T')) {
                        const d = new Date(e.eventDate);
                        dp = d.getFullYear() + '-' + 
                             String(d.getMonth() + 1).padStart(2, '0') + '-' + 
                             String(d.getDate()).padStart(2, '0');
                    } else {
                        dp = e.eventDate;
                    }
                    return new Date(dp + 'T' + (e.eventTime || '00:00'));
                };
                return parseDate(a) - parseDate(b);
            });

        if (upcoming.length === 0) {
            nearestGameCard.innerHTML = window.renderEmptyEventsCard();
            updateTopBarSubtitle(null);
            return;
        }

        const nearest = upcoming[0];
        updateTopBarSubtitle(nearest);

        let userStatus = null;
        try {
            const statusData = await apiGet(`/events/statuses?eventIds=${nearest.eventId}`);
            if (statusData.success && statusData.statuses.length > 0) {
                userStatus = { status: statusData.statuses[0].status };
            }
        } catch (err) {}

        const card = createEventCard(nearest, user.userId, userStatus);
        const temp = document.createElement('div');
        temp.innerHTML = card.render();
        const newCard = temp.firstElementChild;
        nearestGameCard.replaceWith(newCard);

    } catch (error) {
        console.error('Ошибка:', error);
        nearestGameCard.innerHTML = window.renderEmptyEventsCard();
        updateTopBarSubtitle(null);
    }
}

function updateTopBarSubtitle(event) {
    const subtitleEl = document.querySelector('.topBarText p')
    if (!subtitleEl) return

    if (!event) {
        subtitleEl.innerHTML = `<i class="fas fa-map-marker-alt" style="color:#c49a2c;"></i> Нет ближайших событий`
        return
    }

    const location = event.location || 'Пляж'
    const dateLabel = formatEventDate(event.eventDate)
    subtitleEl.innerHTML = `<i class="fas fa-map-marker-alt" style="color:#c49a2c;"></i> Ближайшая игра ${dateLabel} · ${location}`
}

async function loadProfileMiniCard(user) {
    const container = document.getElementById('profile-mini-card')
    if (!container) return

    try {
        const { user: profileData } = await apiGet(`/user/${user.userId}`)

        const initials = `${(profileData.name || '')[0]}${(profileData.surname || '')[0]}`.toUpperCase()
        const fullName = `${profileData.name || ''} ${profileData.surname || ''}`
        const role = `${profileData.position || 'Игрок'} / ${profileData.elo || 1000} elo`

        container.innerHTML = `
            <div class="card">
                <div class="cardHeader"><h3><i class="fas fa-id-card"></i> Профиль</h3></div>
                <a href="profile.html">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                        <div class="userAvatar" style="width:44px;height:44px;">${initials}</div>
                        <div class="userInfo">
                            <div class="userName">${fullName}</div>
                            <div class="userRole">${role}</div>
                        </div>
                    </div>
                </a>
                <div style="display:flex;gap:14px;margin:10px 0;">
                    <div><span class="font-bold">${profileData.elo || '—'}</span><br><small>ELO</small></div>
                    <div><span class="font-bold">${profileData.position || '—'}</span><br><small>Позиция</small></div>
                    <div><span class="font-bold">${profileData.level || '—'}</span><br><small>Уровень</small></div>
                </div>
                <a href="profile.html"><button style="width:100%;"><i class="fas fa-user-edit"></i> Редактировать профиль</button></a>
            </div>`
    } catch (error) {
        container.innerHTML = `
            <div class="card" style="text-align:center;padding:20px;">
                <div style="color:#6b7583;">Не удалось загрузить профиль</div>
            </div>`
    }
}

// ============================================================
// ОБРАБОТКА ЯКОРЯ ПРИ ЗАГРУЗКЕ
// ============================================================

function checkEventAnchor() {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('eventId');
    if (eventId && window.highlightEventCard) {
        setTimeout(() => {
            window.highlightEventCard(parseInt(eventId));
        }, 500);
    }
}

initIndexPage()
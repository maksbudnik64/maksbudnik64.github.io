// ============================================================
// БАЗОВЫЙ КЛАСС КАРТОЧКИ СОБЫТИЯ
// ============================================================

class EventCard {
    constructor(event, currentUserId, userStatus = null) {
        this.event = event;
        this.currentUserId = currentUserId;
        this.userStatus = userStatus;
    }

    get isCreator() {
        return this.event.creatorId === this.currentUserId;
    }

    get statusClass() {
        const s = this.event.status;
        if (s === 'confirmed') return 'confirmed';
        if (s === 'pending')   return 'pending';
        if (s === 'cancelled') return 'cancelled';
        return '';
    }

    get statusText() {
        const s = this.event.status;
        if (s === 'confirmed') return 'Подтверждено';
        if (s === 'pending')   return 'Набирается';
        if (s === 'cancelled') return 'Отменено';
        return s;
    }

    get statusIcon() {
        const s = this.event.status;
        if (s === 'confirmed') return 'fa-check-circle';
        if (s === 'pending')   return 'fa-hourglass-half';
        if (s === 'cancelled') return 'fa-ban';
        return '';
    }

    renderHeader() {
        return `
            <div class="cardHeader">
                <h3>${this.event.title}</h3>
                <span class="eventStatus ${this.statusClass}">
                    <i class="fas ${this.statusIcon}"></i> ${this.statusText}
                </span>
            </div>`;
    }

    renderMeta() {
        return `
            <div class="eventTopRow">
                <div class="eventDate">
                    <i class="far fa-calendar-check"></i>
                    ${new Date(this.event.eventDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })} · ${this.event.eventTime.slice(0,5)}
                </div>
            </div>
            <div class="cardMeta">
                ${this.renderTypeTag()}
                <span class="tag"><i class="fas fa-users"></i> ${this.event.format}</span>
                <span class="tag"><i class="fas fa-star"></i> ${this.event.level}</span>
                ${this.event.duration ? `<span class="tag"><i class="far fa-clock"></i> ${this.event.duration}ч</span>` : ''}
            </div>`;
    }

    renderTypeTag() {
        return '';
    }

    renderLocation() {
        return `
            <div class="eventLocation">
                <i class="fas fa-map-marker-alt"></i> ${this.event.location}
            </div>`;
    }

    renderCreator() {
        if (!this.event.creatorName) return '';
        return `
            <div style="font-size:0.8rem; color:#7a8490; margin-top:4px;">
                Организатор: ${this.event.creatorName} ${this.event.creatorSurname || ''}
            </div>`;
    }

    renderParticipants() {
        const max = this.event.maxPlayers || 0;
        if (!max) return '';
        const count = this.event.participantCount || 0;

        return `
            <div class="participants-block" style="margin:8px 0 12px 0; position: relative;">
                <button class="toggle-participants" style="background:none;border:none;color:#5f6b7a;cursor:pointer;font-weight:600;
                        padding:0; margin:0; display:flex; align-items:center;"
                        data-event-id="${this.event.eventId}">
                    <i class="fas fa-user-friends"></i>&nbsp;${count} / ${max} участников
                    <i class="fas fa-chevron-down" style="margin-left:4px; font-size:0.7rem;"></i>
                </button>
                <div class="participants-modal" style="display:none; position: absolute; top: 100%; left: 0; z-index: 50;
                    background: white; border: 1px solid #e2d9cc; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.1);
                    max-height: 200px; overflow-y: auto; width: 220px; padding: 8px 0; margin:0;">
                    <ul style="list-style: none; margin: 0; padding: 0;" data-event-id="${this.event.eventId}" data-loaded="false"></ul>
                </div>
            </div>`;
    }

    renderDescription() {
        if (!this.event.description) return '';
        return `
            <div style="margin-top:8px;font-size:0.9rem;color:#4a5560;">
                <i class="fas fa-info-circle"></i> ${this.event.description}
            </div>`;
    }

    renderBody() {
        return `
            ${this.renderMeta()}
            ${this.renderLocation()}
            ${this.renderCreator()}
            ${this.renderParticipants()}
            ${this.renderDescription()}
        `;
    }

    renderFooter() {
        if (this.statusClass === 'cancelled') {
            return '<div class="waitList" style="background:#fce8e8"><span><i class="fas fa-ban"></i> Событие отменено</span></div>';
        }

        if (this.isCreator) {
            return `
                <div class="statusButtons">
                    <button class="buttonAccent edit-event-btn" data-event-id="${this.event.eventId}">
                        <i class="fas fa-edit"></i> Редактировать
                    </button>
                    <button class="manage-participants-btn" data-event-id="${this.event.eventId}">
                        <i class="fas fa-users-cog"></i> Участники
                    </button>
                </div>`;
        }

        const activeStatus = this.userStatus ? this.userStatus.status : null;

        if (activeStatus === 'blocked') {
            return '<div class="waitList" style="background:#fce8e8"><span><i class="fas fa-ban"></i> Вы заблокированы организатором</span></div>';
        }

        const isApplicationEvent = this.event.accessType === 'application';
        if (isApplicationEvent) {
            if (activeStatus === 'application') {
                return `<div class="waitList" style="background:#fef9f0"><span><i class="fas fa-clock"></i> Заявка подана</span></div>`;
            }
            if (activeStatus === 'confirmed') {
                return `<div class="waitList" style="background:#e4f1ea"><span><i class="fas fa-check-circle"></i> Заявка принята</span></div>`;
            }
            return `
                <div class="statusButtons">
                    <button class="buttonAccent apply-btn" data-event-id="${this.event.eventId}">
                        <i class="fas fa-file-signature"></i> Подать заявку
                    </button>
                </div>`;
        }

        const max = this.event.maxPlayers || 0;
        const count = this.event.participantCount || 0;
        const isFull = max > 0 && count >= max;

        if (isFull && activeStatus === 'confirmed') {
            return `
                <div class="statusButtons">
                    <button class="buttonAccent" data-js-switch-button data-event-id="${this.event.eventId}" data-status="confirmed">
                        <i class="fas fa-check"></i> Иду
                    </button>
                    <button data-js-switch-button data-event-id="${this.event.eventId}" data-status="maybe">
                        <i class="fas fa-question"></i> Возможно
                    </button>
                    <button data-js-switch-button data-event-id="${this.event.eventId}" data-status="declined">
                        <i class="fas fa-times"></i> Не иду
                    </button>
                </div>`;
        }

        if (isFull && activeStatus !== 'confirmed') {
            const isInReserve = activeStatus === 'waitlist';
            return `
                <div class="statusButtons">
                    <button class="${isInReserve ? 'buttonAccent' : ''}" 
                            data-js-reserve-button data-event-id="${this.event.eventId}">
                        <i class="fas fa-list-ol"></i> ${isInReserve ? 'В резерве' : 'В резерв'}
                    </button>
                </div>`;
        }

        return `
            <div class="statusButtons">
                <button class="${activeStatus === 'confirmed' ? 'buttonAccent' : ''}" 
                        data-js-switch-button data-event-id="${this.event.eventId}" data-status="confirmed">
                    <i class="fas fa-check"></i> Иду
                </button>
                <button class="${activeStatus === 'maybe' ? 'buttonAccent' : ''}" 
                        data-js-switch-button data-event-id="${this.event.eventId}" data-status="maybe">
                    <i class="fas fa-question"></i> Возможно
                </button>
                <button class="${activeStatus === 'declined' ? 'buttonAccent' : ''}" 
                        data-js-switch-button data-event-id="${this.event.eventId}" data-status="declined">
                    <i class="fas fa-times"></i> Не иду
                </button>
            </div>`;
    }

    render() {
        return `
            <div class="card" data-event-id="${this.event.eventId}" style="display: flex; flex-direction: column; height: 100%;">
                ${this.renderHeader()}
                ${this.renderBody()}
                <div style="margin-top: auto;">${this.renderFooter()}</div>
            </div>`;
    }
}

// ============================================================
// КАРТОЧКА ТУРНИРА
// ============================================================

class TournamentCard extends EventCard {
    constructor(event, currentUserId, userStatus = null) {
        super(event, currentUserId, userStatus);
        this.tournamentStatus = event.tournamentStatus || null;
    }

    renderTypeTag() {
        return '<span class="tag" style="background:#fef3e4;color:#b76e2e;"><i class="fas fa-trophy"></i> Турнир</span>';
    }

    renderMeta() {
        return `
            <div class="eventTopRow">
                <div class="eventDate">
                    <i class="far fa-calendar-check"></i>
                    ${new Date(this.event.eventDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })} · ${this.event.eventTime.slice(0,5)}
                </div>
            </div>
            <div class="cardMeta">
                <span class="tag" style="background:#fef3e4;color:#b76e2e;"><i class="fas fa-trophy"></i> Турнир</span>
                <span class="tag"><i class="fas fa-sitemap"></i> ${this.event.tournamentFormat || ''}</span>
                <span class="tag"><i class="fas fa-venus-mars"></i> ${this.event.tournamentGender || 'Мужской'}</span>
                <span class="tag"><i class="fas fa-users"></i> ${this.event.format}</span>
                <span class="tag"><i class="fas fa-star"></i> ${this.event.level}</span>
                ${this.event.duration ? `<span class="tag"><i class="far fa-clock"></i> ${this.event.duration}ч</span>` : ''}
            </div>`;
    }

    renderFooter() {
        if (this.statusClass === 'cancelled') {
            return '<div class="waitList" style="background:#fce8e8"><span><i class="fas fa-ban"></i> Турнир отменён</span></div>';
        }

        const activeStatus = this.userStatus ? this.userStatus.status : null;

        if (activeStatus === 'blocked') {
            return '<div class="waitList" style="background:#fce8e8"><span><i class="fas fa-ban"></i> Вы заблокированы организатором</span></div>';
        }

        // Турнир уже запущен — кнопка перехода для всех
        const tournamentStatus = this.event.tournamentStatus;
        if (tournamentStatus === 'groupStage' || tournamentStatus === 'playoff') {
            return `
                <a href="activeTournament.html?id=${this.event.eventId}" style="display:block;">
                    <button class="buttonAccent" style="width:100%; justify-content:center;">
                        <i class="fas fa-arrow-right"></i> Перейти к турниру
                    </button>
                </a>`;
        }

        // Создатель — кнопки управления
        if (this.isCreator) {
            return `
                <div class="statusButtons">
                    <button class="buttonAccent edit-event-btn" data-event-id="${this.event.eventId}">
                        <i class="fas fa-edit"></i> Редактировать
                    </button>
                    <button class="manage-participants-btn" data-event-id="${this.event.eventId}">
                        <i class="fas fa-users-cog"></i> Участники
                    </button>
                    <button class="buttonAccent start-tournament-btn" data-event-id="${this.event.eventId}">Начать турнир</button>
                </div>`;
        }

        // Турнир по заявкам
        const accessType = this.event.accessType || 'open';
        if (accessType === 'application') {
            if (activeStatus === 'application') {
                return `<div class="statusButtons"><button class="buttonAccent" disabled><i class="fas fa-clock"></i> Заявка подана</button></div>`;
            }
            if (activeStatus === 'confirmed') {
                return `<div class="statusButtons"><button class="buttonAccent" disabled><i class="fas fa-check-circle"></i> Заявка принята</button></div>`;
            }
            if (activeStatus === 'declined') {
                return `<div class="statusButtons"><button disabled><i class="fas fa-times-circle"></i> Заявка отклонена</button></div>`;
            }
            return `<div class="statusButtons"><button class="buttonAccent register-team-btn" data-event-id="${this.event.eventId}" data-format="${this.event.format}"><i class="fas fa-user-plus"></i> Подать заявку</button></div>`;
        }

        // Открытый турнир — запись команды
        if (this.event.status === 'pending') {
            if (activeStatus === 'confirmed' || activeStatus === 'application') {
                return `
                    <div class="statusButtons">
                        <button class="cancel-registration-btn" data-event-id="${this.event.eventId}">
                            <i class="fas fa-times-circle"></i> Отменить запись
                        </button>
                    </div>`;
            }
            return `
                <div class="statusButtons">
                    <button class="buttonAccent register-team-btn" data-event-id="${this.event.eventId}" data-format="${this.event.format}">
                        <i class="fas fa-user-plus"></i> Записать команду
                    </button>
                </div>`;
        }

        return super.renderFooter();
    }
}

// ============================================================
// КАРТОЧКИ ТРЕНИРОВКИ И ИГРЫ
// ============================================================

class TrainingCard extends EventCard {
    renderTypeTag() {
        return '<span class="tag" style="background:#f0e6f6;color:#5b2c8e;"><i class="fas fa-dumbbell"></i> Тренировка</span>';
    }
}

class GameCard extends EventCard {
    renderTypeTag() {
        return '<span class="tag" style="background:#e4f1ea;color:#0b4b3b;"><i class="fas fa-volleyball-ball"></i> Игра</span>';
    }
}

// ============================================================
// ФАБРИКА КАРТОЧЕК
// ============================================================

function createEventCard(event, currentUserId, userStatus = null) {
    switch (event.eventType) {
        case 'tournament': return new TournamentCard(event, currentUserId, userStatus);
        case 'training':   return new TrainingCard(event, currentUserId, userStatus);
        case 'game':       return new GameCard(event, currentUserId, userStatus);
        default:           return new EventCard(event, currentUserId, userStatus);
    }
}

window.createEventCard = createEventCard;
export { EventCard, TournamentCard, TrainingCard, GameCard, createEventCard };
export class ProfileCard {
    constructor(user) {
        this.user = user;
    }

    getAge() {
        if (!this.user.dateOfBirth) return null;
        const today = new Date();
        const birth = new Date(this.user.dateOfBirth);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age;
    }

    getInitials() {
        return (this.user.name?.charAt(0) || '') + (this.user.surname?.charAt(0) || '');
    }

    render() {
        const user = this.user;
        const age = this.getAge();
        const ageString = age !== null ? `${age} лет` : '';
        const heightString = user.height ? `${user.height} см` : '';
        const locationString = user.city ? `<i class="fas fa-map-marker-alt" style="color:#c49a2c;"></i> ${user.city}` : '';
        const positionLevel = `${user.position || 'Игрок'} · ${user.level || ''}`;

        return `
            <div class="card" style="margin-bottom: clamp(16px, 2vw, 24px);">
                <div style="display: flex; align-items: center; gap: clamp(14px, 2vw, 24px); flex-wrap: wrap;">
                    <div class="userAvatar" style="width: clamp(60px, 7vw, 80px); height: clamp(60px, 7vw, 80px); font-size: clamp(1.5rem, 2vw, 2.2rem);">
                        ${this.getInitials()}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; font-size: clamp(1rem, 1.3vw, 1.5rem); margin-bottom: 6px;">
                            ${user.name} ${user.surname}
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: clamp(4px, 0.8vw, 10px); font-size: clamp(0.7rem, 0.85vw, 0.9rem); color: #6b7583;">
                            ${locationString ? `<span>${locationString}</span>` : ''}
                            ${ageString ? `<span>·</span><span>${ageString}</span>` : ''}
                            ${heightString ? `<span>·</span><span>${heightString}</span>` : ''}
                            <span>·</span>
                            <span>${positionLevel}</span>
                        </div>
                    </div>
                    <div style="text-align: center; padding: clamp(6px, 0.8vw, 10px) clamp(10px, 1.2vw, 14px); background: #fbf9f5; border-radius: clamp(8px, 1vw, 12px); border: 1px solid #efe4cf;">
                        <div style="font-size: clamp(0.6rem, 0.7vw, 0.75rem); color: #8e9aab;">ELO</div>
                        <div style="font-size: clamp(1.2rem, 1.6vw, 1.8rem); font-weight: 800; color: #c49a2c;">${user.elo || 1000}</div>
                    </div>
                </div>
            </div>
        `;
    }
}
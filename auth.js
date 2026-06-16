// ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
async function checkAuth() {
    try {
        const response = await fetch('https://petite-wasps-laugh.loca.lt/api/me', {
            credentials: 'include'
        })
        const data = await response.json()

        if (data.success) {
            return data.user
        } else {
            return null
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error)
        return null
    }
}

// ===== ВЫХОД =====
async function logout() {
    try {
        await fetch('https://petite-wasps-laugh.loca.lt/api/logout', {
            method: 'POST',
            credentials: 'include'
        })
    } catch (error) {
        console.error('Ошибка выхода:', error)
    }
    
    window.location.href = 'login.html'
}

// ===== ИНИЦИАЛИЗАЦИЯ ГЛАВНОЙ СТРАНИЦЫ =====
async function initIndexPage() {

await new Promise(resolve => setTimeout(resolve, 300))

    const user = await checkAuth()

    if (!user) {
        window.location.href = 'login.html'
        return
    }

    // Обновляем интерфейс данными пользователя
    const greetingEl = document.querySelector('[data-js-greeting]')
    const userNameEl = document.querySelector('[data-js-user-name]')
    const userRoleEl = document.querySelector('[data-js-user-role]')

    if (greetingEl) {
        greetingEl.textContent = `Добрый день, ${user.name}`
    }
    if (userNameEl) {
        userNameEl.textContent = `${user.name} ${user.surname}`
    }
    if (userRoleEl) {
        userRoleEl.textContent = `${user.position || 'Игрок'} / ${user.elo} elo`
    }

    // Кнопка выхода
    const logoutBtn = document.querySelector('[data-js-logout-button]')
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout)
    }
}

// Запуск при загрузке
if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    initIndexPage()
}
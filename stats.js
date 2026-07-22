import { checkAuth, updateUserCard } from './auth.js'

async function initStatsPage() {
    const user = await checkAuth()
    if (!user) {
        window.location.href = 'login.html'
        return
    }

    updateUserCard(user)
}

initStatsPage()
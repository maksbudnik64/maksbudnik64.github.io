import { checkAuth, updateUserCard } from './auth.js'

async function initDrawPage() {
    const user = await checkAuth()
    if (!user) {
        window.location.href = 'login.html'
        return
    }

    updateUserCard(user)
}

initDrawPage()
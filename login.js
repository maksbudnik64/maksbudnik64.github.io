import { apiPost } from './api.js'

const loginForm = document.querySelector('[data-js-login-form]')
const messageEl = document.querySelector('[data-js-auth-message]')

function showMessage(text, type) {
    messageEl.textContent = text
    messageEl.className = `authMessage ${type}`
    setTimeout(() => {
        messageEl.className = 'authMessage'
    }, 5000)
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault()

    const formData = new FormData(loginForm)
    const formDataObject = Object.fromEntries(formData)

    try {
        const data = await apiPost('/login', formDataObject)
        showMessage('Вход выполнен!', 'success')
        setTimeout(() => {
            window.location.href = 'index.html'
        }, 500)
    } catch (error) {
        showMessage(error.message || 'Не удалось подключиться к серверу', 'error')
    }
})
import { apiPost } from './api.js'

const registerForm = document.querySelector('[data-js-registration-form]')
const messageEl = document.querySelector('[data-js-auth-message]')
const togglePassword = document.querySelector('[data-js-toggle-password]')
const passwordInput = document.getElementById('password')

function showMessage(text, type) {
    messageEl.textContent = text
    messageEl.className = `authMessage ${type}`
    setTimeout(() => { messageEl.className = 'authMessage' }, 5000)
}

// Переключение видимости пароля
togglePassword.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'
    passwordInput.setAttribute('type', type)
    togglePassword.classList.toggle('fa-eye')
    togglePassword.classList.toggle('fa-eye-slash')
})

// Ограничение даты рождения (14–100 лет)
const dateInput = document.getElementById('dateOfBirth')
const today = new Date()
dateInput.setAttribute('max', new Date(today.getFullYear() - 14, today.getMonth(), today.getDate()).toISOString().split('T')[0])
dateInput.setAttribute('min', new Date(today.getFullYear() - 100, today.getMonth(), today.getDate()).toISOString().split('T')[0])

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const formData = new FormData(registerForm)
    const data = Object.fromEntries(formData)

    if (!data.name || data.name.trim().length < 2) {
        showMessage('Имя должно содержать минимум 2 символа', 'error')
        document.getElementById('name').focus()
        return
    }
    if (!data.surname || data.surname.trim().length < 2) {
        showMessage('Фамилия должна содержать минимум 2 символа', 'error')
        document.getElementById('surname').focus()
        return
    }

    data.name = data.name.trim()
    data.surname = data.surname.trim()

    try {
        const result = await apiPost('/registration', data)
        showMessage(`Регистрация успешна! Добро пожаловать, ${result.user.name}!`, 'success')
        registerForm.reset()
        setTimeout(() => { window.location.href = 'index.html' }, 500)
    } catch (error) {
        showMessage(error.message, 'error')
        if (error.message?.includes('email')) {
            document.querySelector('input[name="email"]').focus()
        }
    }
})
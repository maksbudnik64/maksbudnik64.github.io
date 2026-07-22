import { checkAuth } from './auth.js'
import { apiPost } from './api.js'

const form = document.querySelector('[data-js-create-event-form]')
const messageEl = document.querySelector('[data-js-auth-message]')
const tournamentFields = document.querySelector('[data-js-tournament-fields]')
const urlParams = new URLSearchParams(window.location.search)
const preselectedType = urlParams.get('type')

const user = await checkAuth()
if (!user) window.location.href = 'login.html'

// Предзаполнение даты
const dateInput = document.getElementById('eventDate')
const today = new Date()
dateInput.value = today.toISOString().split('T')[0]
dateInput.setAttribute('min', today.toISOString().split('T')[0])

// Переключение видимости полей турнира
document.querySelectorAll('input[name="eventType"]').forEach(radio => {
    radio.addEventListener('change', () => {
        tournamentFields.classList.toggle('visible', radio.value === 'tournament')
    })
})

function showMessage(text, type) {
    messageEl.textContent = text
    messageEl.className = `authMessage ${type}`
    setTimeout(() => { messageEl.className = 'authMessage' }, 5000)
}

// Отправка формы
form.addEventListener('submit', async (e) => {
    e.preventDefault()

    const formData = new FormData(form)
    const data = Object.fromEntries(formData)

    const eventDateTime = new Date(`${data.eventDate}T${data.eventTime}`)
    if (eventDateTime <= new Date()) {
        showMessage('Дата и время события не могут быть в прошлом', 'error')
        document.getElementById('eventDate').focus()
        return
    }

    if (data.eventType !== 'tournament') {
        delete data.tournamentGender
        delete data.tournamentFormat
    }

    try {
        const result = await apiPost('/events/create', data)
        showMessage(result.message, 'success')
        form.reset()
        dateInput.value = today.toISOString().split('T')[0]
        tournamentFields.classList.remove('visible')
        await new Promise(resolve => setTimeout(resolve, 500))
        window.location.href = data.eventType === 'tournament' ? 'tournaments.html' : 'events.html'
    } catch (error) {
        showMessage(error.message || 'Не удалось подключиться к серверу', 'error')
    }
})

// Предвыбор типа события из URL
if (preselectedType === 'tournament') {
    const tournamentRadio = document.querySelector('input[name="eventType"][value="tournament"]')
    if (tournamentRadio) {
        tournamentRadio.checked = true
        tournamentFields?.classList.add('visible')
    }
}
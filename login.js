const loginForm = document.querySelector('[data-js-login-form]')
const messageEl = document.querySelector('[data-js-auth-message]')

function showMessage(text, type) {
    messageEl.textContent = text
    messageEl.style.cssText = `
        padding: 10px 14px;
        border-radius: 8px;
        margin-bottom: 12px;
        font-weight: 600;
        text-align: center;
        background: ${type === 'error' ? '#fce8e8' : '#e4f1ea'};
        color: ${type === 'error' ? '#c0392b' : '#0b4b3b'};
    `
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault()

    const formData = new FormData(loginForm)
    const formDataObject = Object.fromEntries(formData)

    try {
        const response = await fetch('https://https://petite-wasps-laugh.loca.lt/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(formDataObject)
        })

        const data = await response.json()

        if (data.success) {
            showMessage('Вход выполнен!', 'success')
            setTimeout(() => {
                window.location.href = 'index.html'
            }, 500)
        } else {
            showMessage(data.message, 'error')
        }
    } catch (error) {
        showMessage('Не удалось подключиться к серверу', 'error')
    }
})
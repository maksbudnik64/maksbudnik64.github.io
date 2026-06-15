const registerForm = document.querySelector('[data-js-registration-form]')
const messageEl = document.querySelector('[data-js-auth-message]')

function showMessage(text, type) {
    messageEl.textContent = text
    messageEl.className = `authMessage ${type}`
    
    setTimeout(() => {
        messageEl.className = 'authMessage'
    }, 5000)
}

registerForm.addEventListener('submit', (event) => {
    event.preventDefault()
    
    const formData = new FormData(registerForm)
    const formDataObject = Object.fromEntries(formData)
    
    fetch('https://beachvolleyballserver.onrender.com/api/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formDataObject)
    })
    .then((response) => response.json())
    .then((data) => {
        if (data.success) {
            console.log(data.user)
            showMessage(`Регистрация успешна! Добро пожаловать, ${data.user.name}!`, 'success')
            registerForm.reset()
            
            // Даём браузеру время сохранить куку (1.5 секунды)
            setTimeout(() => {
                window.location.href = 'index.html'
            }, 1500)
        } else {
            showMessage(data.message, 'error')
            document.querySelector('input[name="email"]').focus()
        }
    })
    .catch((error) => {
        console.error('Ошибка:', error)
        showMessage('Не удалось подключиться к серверу. Проверьте соединение.', 'error')
    })
})
const registerForm = document.querySelector('[data-js-registration-form]')
registerForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const formData = new FormData(registerForm)
    const formDataObject = Object.fromEntries(formData)
    console.log(formDataObject)
    fetch('http://192.168.0.105:5000/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...formDataObject
        })
    })
    .then((response) => {
        console.log('response:', response)
        return response.json()
    })
    .then((json) => {
        console.log('json', json)
    })
})
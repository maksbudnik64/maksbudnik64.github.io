const onSwitchButtonClick = (switchButton) => {
if(!switchButton.classList.contains('buttonAccent')){
    deleteClassButtonAccent(switchButton)
    switchButton.classList.add('buttonAccent')
}
}

const onReserveButtonClick = (reserveButton) => {
    if(reserveButton.classList.contains('buttonAccent')){
        reserveButton.classList.remove('buttonAccent')
        reserveButton.textContent = 'Записаться в резерв'
    } else {
        reserveButton.classList.add('buttonAccent')
        reserveButton.textContent = 'В резерве'
    }
} 

function deleteClassButtonAccent (currentButton){
const currentButtonParent = currentButton.parentElement
Array.from(currentButtonParent.children).forEach((element) => {
    element.classList.remove('buttonAccent')
})
}

document.addEventListener('click', (event) => {
if(event.target.hasAttribute('data-js-switch-button')){
    onSwitchButtonClick(event.target)
}
})  

document.addEventListener('click', (event) => {
    if(event.target.hasAttribute('data-js-reserve-button')){
        onReserveButtonClick(event.target)
    }
})
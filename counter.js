
const countLeft = document.querySelector('[data-js-count-left]')
const countRight = document.querySelector('[data-js-count-right]')
const counterCard = document.querySelector('[data-js-counter-card]')

const counterButtonLeftMinus = document.querySelector('[data-js-counter-button-left-minus]')
const counterButtonLeftPlus = document.querySelector('[data-js-counter-button-left-plus]')
const counterButtonRightMinus = document.querySelector('[data-js-counter-button-right-minus]')
const counterButtonRightPlus = document.querySelector('[data-js-counter-button-right-plus]')
const counterButtonReset = document.querySelector('[data-js-counter-button-reset]')
const counterButtonSave = document.querySelector('[data-js-counter-button-save]')

const counterTagHTML = '<div style="display: flex; justify-content: center; margin-top: 8px;" data-js-counter-save=tag><span class="tag">Функция пока не доступна</span></div>'

function leftMinusClick() {
if (Number(countLeft.textContent) <= 0) return
countLeft.textContent = Number(countLeft.textContent) - 1
}
function leftPlusClick() {
    if (Number(countLeft.textContent) >= 21) return
countLeft.textContent = Number(countLeft.textContent) + 1
}
function rightMinusClick() {
if (Number(countRight.textContent) <= 0) return
countRight.textContent = Number(countRight.textContent) - 1
}
function rightPlusClick() {
    if (Number(countRight.textContent) >= 21) return
countRight.textContent = Number(countRight.textContent) + 1
}
function resetCount() {
    countLeft.textContent = '0'
    countRight.textContent = '0'
}
function saveCount(){
counterCard.insertAdjacentHTML('beforeend', counterTagHTML)
setTimeout( () => {
const counterTag = document.querySelector('[data-js-counter-save=tag]')
counterTag.remove()    
}, 3000)
}

counterButtonLeftMinus.addEventListener('click', leftMinusClick)
counterButtonLeftPlus.addEventListener('click', leftPlusClick)
counterButtonRightMinus.addEventListener('click', rightMinusClick)
counterButtonRightPlus.addEventListener('click', rightPlusClick)
counterButtonReset.addEventListener('click', resetCount)
counterButtonSave.addEventListener('click', saveCount)
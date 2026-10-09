import { renderSVG } from '../vendor/uqr/dist/index.mjs'
import { phoneLink, resetPhoneKey } from './bridge.js'

// The Add books screen: a QR code of the Phone Page link (carrying the Access Key) and
// the written address. It opens from the home screen's Add books tile. Reset key needs
// a second press, because every phone then has to scan again.
const home = document.getElementById('home')
const tile = document.getElementById('add-books')
const screen = document.getElementById('add-books-screen')
const qr = screen.querySelector('.qr')
const address = screen.querySelector('.address')
const hint = screen.querySelector('.hint')
const resetButton = document.getElementById('reset-key')
const resetLabel = resetButton.textContent
let confirmingReset = false

const show = link => {
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--text').trim()
    qr.innerHTML = link.url ? renderSVG(link.url, { blackColor: ink, whiteColor: '#FFFFFF' }) : ''
    address.textContent = link.address ?? ''
    hint.textContent = link.url ? 'Scan with your phone to add books'
        : link.error ?? 'Connect the TV to Wi-Fi to add books'
    resetButton.hidden = !link.url
    if (resetButton.hidden) document.body.focus()
}

const setConfirming = confirming => {
    confirmingReset = confirming
    resetButton.textContent = confirming ? 'Press again to reset · every phone must scan again' : resetLabel
}

resetButton.addEventListener('click', () => {
    if (!confirmingReset) return setConfirming(true)
    setConfirming(false)
    show(resetPhoneKey())
})
resetButton.addEventListener('blur', () => setConfirming(false))

export const isAddBooksOpen = () => !screen.hidden

export const openAddBooks = () => {
    home.hidden = true
    screen.hidden = false
    setConfirming(false)
    resetButton.hidden = false
    resetButton.focus()
    show(phoneLink())
}

export const closeAddBooks = () => {
    screen.hidden = true
    home.hidden = false
    tile.focus()
}

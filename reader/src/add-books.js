import { renderSVG } from '../vendor/uqr/dist/index.mjs'
import { phoneLink, resetPhoneKey } from './bridge.js'

// The Add books screen: a QR code of the Phone Page link (carrying the Access Key) and
// the written address. It opens from the Shelf's Add books tile. Reset key needs a
// second press, because every phone then has to scan again.
const shelf = document.getElementById('shelf')
const screen = document.getElementById('add-books-screen')
const resetButton = document.getElementById('reset-key')
const resetLabel = resetButton.textContent
let confirmingReset = false

// Draws the Phone Page link into an element holding .qr, .hint and .address (here, and
// on the empty Shelf). Returns whether there's a link to scan.
export const drawLink = (target, link) => {
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--text').trim()
    target.querySelector('.qr').innerHTML = link.url ? renderSVG(link.url, { blackColor: ink, whiteColor: '#FFFFFF' }) : ''
    target.querySelector('.address').textContent = link.address ?? ''
    target.querySelector('.hint').textContent = link.url ? 'Scan with your phone to add books'
        : link.error ?? 'Connect the TV to Wi-Fi to add books'
    return Boolean(link.url)
}

const show = link => {
    resetButton.hidden = !drawLink(screen, link)
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
    shelf.hidden = true
    screen.hidden = false
    setConfirming(false)
    resetButton.hidden = false
    resetButton.focus()
    show(phoneLink())
}

export const closeAddBooks = () => {
    screen.hidden = true
    shelf.hidden = false
    document.getElementById('add-books').focus()
}

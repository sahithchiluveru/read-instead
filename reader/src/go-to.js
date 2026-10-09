// Go to %: a wide slider over the pages. ←/→ move 1%, faster while held; ↑/↓ move 10%.
// The chapter at the chosen percent shows live. OK jumps, Back cancels.
const panel = document.getElementById('go-to')
const percentText = panel.querySelector('.percent')
const chapterText = panel.querySelector('.chapter')
const fill = panel.querySelector('.fill')
const thumb = panel.querySelector('.thumb')

let percent = 0
let startPercent = 0
let startChapter = ''
let chapterAt = null // fraction → Promise of the chapter's label
let repeats = 0 // key repeats in the current hold of ←/→
let heldDirection = 0

// A held key repeats about 20 times a second: 1% per repeat for the first half second,
// then 2%, then 5%, so the whole book is a few seconds' hold away.
const holdStep = repeats => repeats < 10 ? 1 : repeats < 20 ? 2 : 5

// Opens at where the reader is: { progress (0–1), chapter }. previewChapter gives the
// chapter at another fraction. (An EPUB's progress counts up to the end of the Spread,
// so the chapter at that exact fraction can already be the next one.)
export const openGoTo = ({ progress, chapter }, previewChapter) => {
    startPercent = Math.round(progress * 100)
    startChapter = chapter
    chapterAt = previewChapter
    chapterText.textContent = ''
    panel.hidden = false
    show(startPercent)
}

const show = value => {
    percent = Math.min(Math.max(value, 0), 100)
    percentText.textContent = `${percent}%`
    fill.style.width = thumb.style.left = `${percent}%`
    const asked = percent
    const chapter = percent === startPercent ? Promise.resolve(startChapter) : chapterAt(percent / 100)
    chapter.then(label => {
        if (percent === asked && !panel.hidden) chapterText.textContent = label
    }, error => console.error(error))
}

// ←/→: direction -1 or 1; repeat is whether the key is being held.
export const nudgeGoTo = (direction, repeat) => {
    repeats = repeat && direction === heldDirection ? repeats + 1 : 0
    heldDirection = direction
    show(percent + direction * holdStep(repeats))
}

// ↑/↓: direction 1 or -1.
export const leapGoTo = direction => show(percent + direction * 10)

// The fraction to jump to, or null if the slider hasn't moved.
export const goToTarget = () => percent === startPercent ? null : percent / 100

export const closeGoTo = () => {
    panel.hidden = true
    chapterAt = null
}

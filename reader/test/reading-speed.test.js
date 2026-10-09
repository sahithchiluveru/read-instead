import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MIN_SAMPLES, ReadingSpeed } from '../src/reading-speed.js'

// Plays the owner reading with a fake clock: each Spread shows `characters` and is read
// for `seconds` before → turns to the next one.
const reader = (saved = null) => {
    let now = 0
    const saves = []
    const speed = new ReadingSpeed(saved, { now: () => now, onChange: state => saves.push(state) })
    let shownYet = false
    const read = (seconds, characters = 1000) => {
        if (!shownYet) {
            speed.shown(characters)
            shownYet = true
        }
        now += seconds * 1000
        speed.shown(characters, { turned: true })
    }
    return { speed, saves, read, wait: seconds => { now += seconds * 1000 } }
}

test('there is no estimate until enough Spreads have been read', () => {
    const { speed, read } = reader()
    assert.equal(speed.minutesFor(6000), null)
    for (let i = 0; i < MIN_SAMPLES - 1; i++) read(50)
    assert.equal(speed.minutesFor(6000), null)
    read(50)
    assert.equal(speed.minutesFor(6000), 5) // 1000 characters in 50 s: 6000 in 300 s
})

test('the estimate converges on the reading speed as it changes', () => {
    const { speed, read } = reader()
    for (let i = 0; i < 20; i++) read(40 + (i % 2) * 20) // 50 s per 1000 characters on average
    assert.ok(Math.abs(speed.minutesFor(6000) - 5) < 0.3, `${speed.minutesFor(6000)}`)
    for (let i = 0; i < 200; i++) read(i % 2 ? 80 : 100) // slower now: 90 s per 1000
    assert.ok(Math.abs(speed.minutesFor(6000) - 9) < 0.3, `${speed.minutesFor(6000)}`)
})

test('long idle gaps and rapid skimming are ignored', () => {
    const { speed, saves, read } = reader()
    for (let i = 0; i < 10; i++) read(50)
    const learned = speed.minutesFor(6000)
    const saved = saves.length
    read(1800) // left the TV for half an hour
    read(600) // ten minutes on one Spread is still idle, not slow reading
    read(1) // flicking through
    read(5)
    assert.equal(speed.minutesFor(6000), learned)
    assert.equal(saves.length, saved, 'nothing new to save')
})

test('outliers are ignored even before the estimate is shown', () => {
    const { speed, read } = reader()
    read(3600)
    read(0.5)
    for (let i = 0; i < MIN_SAMPLES; i++) read(50)
    assert.equal(speed.minutesFor(6000), 5)
})

test('only a → turn from a Spread read in full counts', () => {
    const { speed, read, wait } = reader()
    for (let i = 0; i < MIN_SAMPLES; i++) read(50)
    const learned = speed.minutesFor(6000)
    // A jump (or ←) lands on a Spread; the time before it isn't a turn's.
    wait(20)
    speed.shown(1000)
    // Opening the Top Bar or a menu mid-Spread: the time on it is no longer all reading.
    wait(20)
    speed.interrupt()
    wait(20)
    speed.shown(1000, { turned: true })
    assert.equal(speed.minutesFor(6000), learned)
    // The next → turn counts again.
    wait(100)
    speed.shown(1000, { turned: true })
    assert.ok(speed.minutesFor(6000) > learned)
})

test('Spreads with little text (a picture, a chapter\'s last lines) say nothing about speed', () => {
    const { speed, read } = reader()
    for (let i = 0; i < 20; i++) read(2, 40)
    assert.equal(speed.minutesFor(6000), null)
})

test('the estimate is saved after every sample and picked up again', () => {
    const { saves, read } = reader()
    for (let i = 0; i < MIN_SAMPLES; i++) read(50)
    assert.equal(saves.length, MIN_SAMPLES)
    const restored = new ReadingSpeed(JSON.parse(JSON.stringify(saves.at(-1))))
    assert.equal(restored.minutesFor(6000), 5)
})

test('a damaged saved estimate starts afresh', () => {
    for (const saved of [null, {}, { secondsPerCharacter: -1, samples: 9 }, { secondsPerCharacter: 'x', samples: 9 },
        { secondsPerCharacter: 0.05, samples: 'many' }, 'nonsense'])
        assert.equal(new ReadingSpeed(saved).minutesFor(6000), null, JSON.stringify(saved))
})

test('a short remainder still reads as a minute, and nothing left reads as nothing', () => {
    const { speed, read } = reader()
    for (let i = 0; i < MIN_SAMPLES; i++) read(50)
    assert.equal(speed.minutesFor(100), 1)
    assert.equal(speed.minutesFor(0), null)
    assert.equal(speed.minutesFor(null), null)
})

test('a long pause on a Spread full of text is still an idle gap', () => {
    const { speed, read } = reader()
    read(15 * 60, 4000) // a plausible speed for so much text, but a quarter of an hour on one Spread
    read(200) // the next one, read at the usual 20 characters a second
    for (let i = 0; i < MIN_SAMPLES - 1; i++) read(50)
    assert.equal(speed.minutesFor(6000), 5)
})

test('a wrong saved speed corrects itself once turns keep disagreeing with it the same way', () => {
    // Saved from much denser books: 10 s per 1000 characters, but the owner now takes 50 s.
    const { speed, read } = reader({ secondsPerCharacter: 0.01, samples: 40 })
    assert.equal(speed.minutesFor(6000), 1)
    read(50)
    read(50)
    assert.equal(speed.minutesFor(6000), 1, 'one or two outliers are still ignored')
    read(50)
    assert.equal(speed.minutesFor(6000), 5, 'three in a row on the same side re-seed it')
    read(50)
    assert.equal(speed.minutesFor(6000), 5)
})

test('outliers on both sides never add up to a correction', () => {
    const { speed, read } = reader()
    for (let i = 0; i < 10; i++) read(100) // 10 characters a second
    for (let i = 0; i < 6; i++) read(i % 2 ? 25 : 400) // 4x faster, 4x slower, ...
    assert.equal(speed.minutesFor(6000), 10)
})

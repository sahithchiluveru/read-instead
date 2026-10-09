// The owner's reading speed, learned from page turns, for the "~N min left in chapter"
// estimate. One estimate serves every book, and it's saved as it changes.
//
// A sample is how long a Spread stayed on screen before → turned to the next one, over the
// characters it showed. Samples feed a running average of seconds per character: a plain
// mean at first, then weighted towards about the last WINDOW samples, so it follows the
// owner as they speed up or slow down. Outliers are left out: idle gaps (the owner walked
// away, or the TV was switched off), skimming, Spreads with too little text to tell, and,
// once the estimate is shown, anything far off it, unless turn after turn disagrees with
// it the same way. The estimate is saved as
// { secondsPerCharacter, samples }.

// Samples needed before an estimate is shown.
export const MIN_SAMPLES = 5
// Spreads with less text than this (a picture, a chapter's last lines) are left out.
const MIN_CHARACTERS = 200
// Plausible speeds in characters per second (about 25 to 700 words a minute): slower is
// an idle gap, faster is skimming.
const SLOWEST = 2
const FASTEST = 60
// However much text a Spread holds, longer than this on it is an idle gap too.
const LONGEST_SECONDS = 10 * 60
// Once the estimate is shown, a sample more than this many times slower or faster is an outlier.
const OUTLIER_FACTOR = 3
// This many outliers in a row, all slower or all faster, mean the estimate itself is wrong
// (a stale saved speed, or a switch to much sparser or denser books): it restarts from them.
const RESEED_AFTER = 3
// How many recent samples the running average weighs once it has that many.
const WINDOW = 50

export class ReadingSpeed {
    #secondsPerCharacter = 0
    #samples = 0
    #now
    #onChange
    #spread = null // the Spread on screen: { characters, since }, or null when it can't be timed
    #outliers = [] // the latest outliers in a row, all on one side (seconds per character)

    // saved is a previously saved estimate (see toJSON), or null. now gives the time in ms;
    // onChange receives the estimate (to be saved) whenever a sample changes it.
    constructor(saved, { now = () => Date.now(), onChange = () => {} } = {}) {
        this.#now = now
        this.#onChange = onChange
        const { secondsPerCharacter, samples } = saved ?? {}
        if (secondsPerCharacter > 0 && Number.isInteger(samples) && samples > 0) {
            this.#secondsPerCharacter = secondsPerCharacter
            this.#samples = samples
        }
    }

    // A new Spread is on screen, showing this many characters. turned says it came from
    // the Spread before it by a → turn, which ends that Spread's sample; anything else (a
    // ← turn, a jump, opening the book) only starts timing this one.
    shown(characters, { turned = false } = {}) {
        const spread = this.#spread
        if (turned && spread) this.#sample(spread.characters, (this.#now() - spread.since) / 1000)
        this.#spread = { characters, since: this.#now() }
    }

    // The Spread on screen is no longer being read straight through (the Top Bar or a menu
    // was opened, or it's being scrolled rather than turned), so its time doesn't count.
    interrupt() {
        this.#spread = null
    }

    // Whole minutes (at least 1) to read this many characters, or null before enough
    // samples, or with nothing to read.
    minutesFor(characters) {
        if (this.#samples < MIN_SAMPLES || !(characters > 0)) return null
        return Math.max(1, Math.round(characters * this.#secondsPerCharacter / 60))
    }

    toJSON() {
        return { secondsPerCharacter: this.#secondsPerCharacter, samples: this.#samples }
    }

    #sample(characters, seconds) {
        if (characters < MIN_CHARACTERS || seconds <= 0 || seconds > LONGEST_SECONDS) return
        const perSecond = characters / seconds
        if (perSecond < SLOWEST || perSecond > FASTEST) return
        const secondsPerCharacter = seconds / characters
        if (this.#samples >= MIN_SAMPLES && this.#isOutlier(secondsPerCharacter)) {
            if (this.#outliers.length < RESEED_AFTER) return
            this.#secondsPerCharacter = mean(this.#outliers)
            this.#outliers = []
        } else {
            this.#outliers = []
            this.#samples++
            const weight = 1 / Math.min(this.#samples, WINDOW)
            this.#secondsPerCharacter += (secondsPerCharacter - this.#secondsPerCharacter) * weight
        }
        this.#onChange(this.toJSON())
    }

    // Whether a sample is far off the estimate, keeping track of outliers in a row on one side.
    #isOutlier(secondsPerCharacter) {
        const ratio = secondsPerCharacter / this.#secondsPerCharacter
        const side = ratio > OUTLIER_FACTOR ? 1 : ratio < 1 / OUTLIER_FACTOR ? -1 : 0
        if (!side) return false
        const estimate = this.#secondsPerCharacter
        const sameSide = this.#outliers.every(outlier => Math.sign(outlier - estimate) === side)
        this.#outliers = [...(sameSide ? this.#outliers : []), secondsPerCharacter]
        return true
    }
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length

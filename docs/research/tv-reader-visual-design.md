# TV reader visual design: research and recommended defaults

Target: 65" Sony Bravia 3 (Google TV), app laid out at 960×540 dp (1920×1080 px), viewed from about 2–3 m. Two-page spread. EPUBs render through foliate-js and PDFs through pdf.js, both in an Android WebView. Themes are Sepia (default), Dark and Light.

Status labels used below:
- **[verified]**: read in the primary source.
- **[computed]**: my own arithmetic, with the method shown.
- **[unverified]**: I could not confirm it in a primary source.

Scholarly sources are cited by DOI or an open-access copy. LibKey was not available in this session (not authenticated), so no LibKey access links are included.

---

## 1. Android TV / Google TV 10-foot guidelines

| Topic | Guidance | Source |
|---|---|---|
| Canvas | Design at **960×540 dp** (1 px = 1 dp at MDPI). Target 1080p assets. | [TV layouts](https://developer.android.com/design/ui/tv/guides/styles/layouts) [verified] |
| Safe area | "position the elements with a 5% margin of **48dp on the left and right** sides, and **27dp on the top and bottom**". Elsewhere the same page says "24dp" and "58dp … 28dp", so the page contradicts itself. 48/27 is the correct 5% arithmetic (960×0.05, 540×0.05). The page also notes: "Most modern TVs no longer have overscan issues." Backgrounds may bleed past the safe area. | [TV layouts](https://developer.android.com/design/ui/tv/guides/styles/layouts) [verified] |
| Grid | 12 columns of 52 dp, 20 dp gutters, 58 dp side space. | same [verified] |
| Viewing distance | "the average distance between a TV and its viewers is 3 meters (10 feet)" | [Design for TV](https://developer.android.com/design/ui/tv/guides/foundations/design-for-tv) [verified] |
| Text size | No numeric minimum, only "prioritize using larger typography". The default face is Roboto. Choose fonts with large counters and avoid thin strokes. TV Material type tokens: BodyLarge 16/24 sp, BodyMedium 14/20, LabelLarge 14/20, TitleLarge 22/28, HeadlineSmall 24/32. | [TV typography](https://developer.android.com/design/ui/tv/guides/styles/typography), [TypeScaleTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/tv/tv-material/src/main/java/androidx/tv/material3/tokens/TypeScaleTokens.kt) [verified] |
| Text size (Amazon, also Android-based) | Body text "at least 14sp, which is approximately … 28px on 1080p". "Use greater line spacing than you would use on a desktop or tablet". Keep the outer 5% clear. "use less saturated colors". | [Fire TV design guidelines](https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html) [verified] |
| Color | "Build from dark themes". Use sRGB for UI. "Use high contrast between text and background colors". "Choose clear, readable fonts with larger sizes and line spacing". "Using darker colors saves power. Avoid using white background unless necessary." Design and test in Standard picture mode. Low-contrast panels make colors look "washed out". | [Color system](https://developer.android.com/design/ui/tv/guides/styles/color-system), [Color on TV](https://developer.android.com/design/ui/tv/guides/foundations/color-on-tv) [verified] |
| Pure white / pure black | Google gives no explicit rule. TV Material's own dark scheme avoids both: Background/Surface = Neutral10 `#1C1B1F`, OnSurface = Neutral90 `#E6E1E5`. | [ColorDarkTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/tv/tv-material/src/main/java/androidx/tv/material3/tokens/ColorDarkTokens.kt), [PaletteTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/tv/tv-material/src/main/java/androidx/tv/material3/tokens/PaletteTokens.kt) [verified] |
| Focus | States are default / focused / pressed. Only one element has focus at a time. Focus is shown by scale ("Default scaling values are: 1.025, 1.05 and 1.1x"), outline (width + inset + color), glow (2–32 dp) and surface/content color change. No widths or timings are specified. | [Focus system](https://developer.android.com/design/ui/tv/guides/styles/focus-system) [verified] |
| Font scale | Respect the user's `fontScale`. Test with `adb shell settings put system font_scale 1.2f`. | [TV accessibility](https://developer.android.com/training/tv/accessibility) [verified] |

Whether the Sony Bravia 3 overscans by default is **[unverified]**. Keep the 48/27 dp safe area for UI chrome and text.

## 2. Readability research

**Print size by visual angle.** Legge & Bigelow 2011 (J. Vision 11(5):8, [doi:10.1167/11.5.8](https://doi.org/10.1167/11.5.8), [PMC3428264](https://pmc.ncbi.nlm.nih.gov/articles/PMC3428264)) [verified]:
- "a consensus value for the critical print size for normally sighted readers is 0.2° x-height". Reading slows below this size.
- The fluent range runs "from approximately 0.2° to 2°".
- Paperbacks average 0.24° at 40 cm and newspapers 0.23°.
- Reading speed declines only gradually above about 2°.

**Converting to dp on this TV** [computed]:
- A 65" 16:9 panel measures 1439 × 809 mm. With 540 dp of height, **1 dp ≈ 1.499 mm**.
- The x-height needed for angle θ at distance D is `2·D·tan(θ/2)`. At 2.5 m: 0.2° → 8.73 mm (5.8 dp), 0.24° → 10.5 mm (7.0 dp), 0.3° → 13.1 mm (8.7 dp), 0.4° → 17.5 mm (11.6 dp).
- Measured x-height/em from each font's OS/2 `sxHeight`: Literata 0.507, Source Serif 4 0.475, Bitter 0.522, Atkinson Hyperlegible Next 0.496, Charis SIL 0.482.
- Literata font size for each angle:

| Angle | 2.0 m | 2.5 m | 3.0 m |
|---|---|---|---|
| 0.2° (critical print size) | 9.2 dp | 11.5 dp | 13.8 dp |
| 0.24° (paperback) | 11.0 dp | 13.8 dp | 16.5 dp |
| 0.3° | 13.8 dp | 17.2 dp | 20.7 dp |
| 0.4° | 18.4 dp | 23.0 dp | 27.6 dp |

- A **20 dp** default gives 0.35° at 2.5 m and 0.29° at 3 m. That is about 1.5× the critical print size, which leaves margin for older eyes, TV softness and 3 m seating. It also clears Amazon's 14 sp floor.

**Line length.**
- Dyson 2004 (Behav. & Inf. Tech. 23(6):377–393, [doi:10.1080/01449290410001715714](https://doi.org/10.1080/01449290410001715714)) reviews screen reading. It finds characters-per-line to be the critical variable, longer lines tend to be read faster, and readers prefer moderate lengths. [verified via abstract/repository record](https://centaur.reading.ac.uk/23344).
- Dyson & Kipping 1998 is reported as finding that 100 cpl was read faster than 25 cpl while 55 cpl was rated easiest. Dyson & Haselgrove 2001 (IJHCS 54:585–612) is reported as finding 55 cpl good for speed and comprehension. Both are **[unverified]**: only secondary summaries were accessible.
- WCAG 1.4.8 (AAA) asks that a mechanism allow width ≤ 80 characters and no full justification ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#visual-presentation)) [verified].

**Line height.**
- WCAG 1.4.8 asks for leading of at least 1.5 within paragraphs. WCAG 1.4.12 (AA) requires layouts to survive line-height 1.5×, paragraph spacing 2×, letter spacing 0.12× and word spacing 0.16× ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#text-spacing)) [verified].
- Foliate's defaults are `line-height: 1.5`, justify on, hyphenate on ([book-viewer.js](https://github.com/johnfactotum/foliate/blob/gtk4/src/book-viewer.js)) [verified].
- Amazon recommends more line spacing on TV than on desktop (above) [verified].

**Serif vs sans.** Arditi & Cho 2005 (Vision Res. 45(23):2926–33, [doi:10.1016/j.visres.2005.06.013](https://doi.org/10.1016/j.visres.2005.06.013), [PMC4612630](https://pmc.ncbi.nlm.nih.gov/articles/PMC4612630)) [verified via abstract]:
- They tested fonts that differed only in serif size.
- Serifs had at most a small legibility effect.
- Typeface choice should rest on x-height, stroke weight and counters, not on the serif/sans category.
- Google's TV guide suggests sans for UI labels, which fits a sans face for the top bar.

**Margins.** I found no primary study that sets an optimal outer page margin for screen reading **[unverified]**. Use the platform safe area plus an inner gutter (section 6).

## 3. Themes: polarity, contrast, reference colors

**Polarity evidence** [verified unless marked]:
- **Positive polarity (dark on light) wins in lab tasks.** Piepenbrock, Mayr, Mund & Buchner 2013 (Ergonomics 56(7)) found a positive-polarity advantage in acuity and proofreading for both younger and older adults ([abstract record](https://documentacion.fundacionmapfre.org/documentacion/bib/143702.do)).
- **The advantage comes from luminance.** Buchner, Mayr & Brandt 2009 (Ergonomics 52(7):882–886) has the title "The advantage of positive text-background polarity is due to high display luminance" ([record](https://madoc.bib.uni-mannheim.de/26118/)). Its full findings are **[unverified]**: only metadata was accessible.
- **The effect may be small.** Dobres, Chahine & Reimer 2017 (Applied Ergonomics 60) is reported to find little legibility difference across ambient conditions, framing it as a slight negative-polarity disadvantage. **[unverified, secondary]**
- **Warm tints read faster.** Rello & Bigham 2017 (ASSETS, [doi:10.1145/3132525.3132546](https://doi.org/10.1145/3132525.3132546), [PDF](https://www.changedyslexia.org/publications/pdfs/2017-ASSETS-Good%20Background%20Colors.pdf)) tested 341 readers, 89 with dyslexia. Warm backgrounds (peach, orange, yellow) gave significantly faster reading than cool ones. This is some support for a sepia default.
- **No direct sepia or eye-strain data.** I found no primary study measuring "sepia" or eye strain specifically. Claims about halation or blue light are **[unverified]**.
- **Room lighting.** Google says to avoid large white backgrounds (power) and to build from dark. In a dark living room, a large bright sepia or white field at TV luminance may be uncomfortable. That is a reasoned inference **[unverified]**, so Dark should be one remote press away.

**WCAG thresholds** [verified]:
- 1.4.3 (AA): text ≥ 4.5:1.
- 1.4.6 (AAA): text ≥ 7:1.
- 1.4.11: UI component and graphic boundaries ≥ 3:1.
- 2.4.13 Focus Appearance (AAA): the indicator area must be ≥ a 2 CSS px perimeter of the component and have ≥ 3:1 contrast between focused and unfocused pixels.
- Ratio = (L1+0.05)/(L2+0.05) using sRGB relative luminance.
- Sources: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html).

**Reference reader colors.** Contrast ratios are computed.

| Reader / theme | bg | fg | link | contrast |
|---|---|---|---|---|
| Foliate Default light / dark | `#ffffff` / `#222222` | `#000000` / `#e0e0e0` | `#0066cc` / `#77bbee` | 21 / 12.05 |
| Foliate Sepia light | `#f1e8d0` | `#5b4636` | `#008b8b` | 7.24 |
| Foliate Sepia dark | `#342e25` | `#ffd595` | `#48d1cc` | — |
| Foliate Solarized light | `#fdf6e3` | `#586e75` | `#268bd2` | — |
| Foliate Gruvbox light / dark | `#fbf1c7` / `#282828` | `#3c3836` / `#ebdbb2` | | — |
| TV Material dark | `#1C1B1F` | `#E6E1E5` | | 13.27 |

Notes on the table:
- Foliate source: [themes.js](https://github.com/johnfactotum/foliate/blob/gtk4/src/themes.js) [verified].
- KOReader has no sepia color theme in its source; a code search for "sepia" returned nothing. Its "Night mode" inverts the framebuffer, using hardware inversion where available and otherwise `self.bb:invert()` ([framebuffer.lua](https://github.com/koreader/koreader-base/blob/master/ffi/framebuffer.lua)). Page background is a gray level ([readerview.lua](https://github.com/koreader/koreader/blob/master/frontend/apps/reader/modules/readerview.lua)) [verified].
- Apple Books and Kindle theme hex values are not officially published **[unverified]**. Do not copy them.

## 4. Open-licensed reading fonts

All five are **SIL OFL 1.1**, so they can be bundled in an app with the license text included.

| Font | Variable axes (Google Fonts build) | x-h/em | avg char width* | Design intent | Source |
|---|---|---|---|---|---|
| **Literata** | `opsz, wght` (+ italic) | 0.507 | 0.462 em | "a contemporary serif typeface family for long-form reading". Originally the Google Play Books typeface, by TypeTogether. Google Fonts ships the *print* version; an ebook version also exists. | [repo](https://github.com/googlefonts/literata), [google/fonts](https://github.com/google/fonts/tree/main/ofl/literata) |
| **Source Serif 4** | `opsz, wght` (+ italic) | 0.475 | 0.435 em | Transitional, Fournier-based, by Adobe (Frank Grießhammer). Companion to Source Sans 3. | [repo](https://github.com/adobe-fonts/source-serif), [google/fonts](https://github.com/google/fonts/tree/main/ofl/sourceserif4) |
| **Bitter** | `wght` (+ italic) | 0.522 | 0.438 em | Slab serif "specially designed for comfortably reading on any computer or device". By Sol Matas, starting from the pixel grid. | [repo](https://github.com/solmatas/BitterPro), [google/fonts](https://github.com/google/fonts/tree/main/ofl/bitter) |
| **Atkinson Hyperlegible Next** | `wght` (+ italic) | 0.496 | 0.430 em | Sans by the Braille Institute "developed specifically to increase legibility for readers with low vision", with distinctive letterforms. | [repo](https://github.com/googlefonts/atkinson-hyperlegible-next), [google/fonts](https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegiblenext) |
| **Charis SIL** | none (static R/I/B/BI) | 0.482 | 0.437 em | Wide Latin and Cyrillic coverage with smart diacritic positioning. | [repo](https://github.com/silnrsi/font-charis), [google/fonts](https://github.com/google/fonts/tree/main/ofl/charissil) |

\*Average advance over an English prose sample, measured from each font's default instance via `hmtx`/`cmap` [computed]. Literata is the widest, so cpl estimates below are conservative.

Literata's `opsz` axis lets the app pick a text optical size. Larger x-height and sturdier strokes match Google's TV advice on large counters and avoiding thin strokes. Set `font-optical-sizing: auto` or set `opsz` explicitly. Which opsz value is best at TV distance is **[unverified]**; test 12 vs 18.

## 5. PDF on TV

**Dark-mode options in pdf.js** [verified from source]:
- **`pageColors: {background, foreground}`** is a `PDFViewer` option documented as "Overwrites background and foreground colors … to improve readability in high contrast mode" ([pdf_viewer.js](https://github.com/mozilla/pdf.js/blob/master/web/pdf_viewer.js)). The generic viewer exposes it as `forcePageColors` plus `pageColorsBackground` / `pageColorsForeground` ([app_options.js](https://github.com/mozilla/pdf.js/blob/master/web/app_options.js)).
- **How it works.** After rendering, `canvas.js#drawFilter` redraws the whole canvas through an SVG filter ([canvas.js](https://github.com/mozilla/pdf.js/blob/master/src/display/canvas.js)). `DOMFilterFactory.addHCMFilter` converts to luminance and grayscale, then maps luminance onto a **6-step ramp from fg to bg** ([dom_filter_factory.js](https://github.com/mozilla/pdf.js/blob/master/src/display/dom_filter_factory.js)). It is a no-op for pure `#000000`/`#ffffff`.
- **Pitfall:** the filter applies to the whole bitmap, so **photos and figures become posterized two-tone grayscale**. That is fine for text-only PDFs and bad for illustrated ones.

**CSS `filter: invert(1) hue-rotate(180deg)`** on the page canvas:
- `invert` flips lightness and also inverts hue. Rotating 180° roughly restores the original hues ([MDN invert](https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/invert), [MDN hue-rotate](https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/hue-rotate)).
- Photos still end up as lightness negatives. pdf.js paints each page into one canvas, so images cannot be targeted separately without custom rendering.
- Pure black becomes pure white. Add `brightness(0.85)` / `contrast(0.9)`, or composite a tinted layer, to land near the Dark theme colors **[unverified: tune by eye]**.

**Sepia for PDFs.** Put the canvas over the sepia background with `mix-blend-mode: multiply` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/mix-blend-mode)). White paper takes on the sepia color, black stays black, and images get a mild tint but are not inverted. This is the safest non-light treatment for illustrated PDFs.

**WebView darkening.** Disable algorithmic darkening so it doesn't fight the app's own themes:
- Call `WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)` (API 33+ targets), or use `FORCE_DARK_OFF` on targets ≤ 32.
- Ship `<meta name="color-scheme" content="light dark">` or use `DARK_STRATEGY_WEB_THEME_DARKENING_ONLY`.
- Source: [WebView dark theme](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme) [verified].

**Auto-trimming white margins:**
- pdf.js has no auto-crop. Maintainers closed "Add cropping to the API" saying pdf.js is "purely a renderer/viewer" ([#2550](https://github.com/mozilla/pdf.js/issues/2550)).
- A "Content Fit/Content Width" zoom request is still open and cites KOReader's auto-crop ([#20574](https://github.com/mozilla/pdf.js/issues/20574), [KOReader PDF guide](https://koreader.rocks/user_guide/#L2-readingpdfs)) [verified].
- Workaround suggested in #2550: build a `PageViewport` with `offsetX/offsetY` and a smaller canvas. `viewBox`, `offsetX`, `offsetY` and `dontFlip` are documented params ([page_viewport.js](https://github.com/mozilla/pdf.js/blob/master/src/display/page_viewport.js)).
- Recommended approach [computed design]:
  1. Render each page once at low scale (about 0.25) offscreen.
  2. Scan the pixels for a bounding box of anything darker than a threshold, roughly luminance < 0.95.
  3. Pad the box by about 2% and clamp it.
  4. Optionally take the **median box across odd and even pages** so headers and page numbers don't make the crop jump.
  5. Render at full scale with `page.getViewport({scale, offsetX:-x*scale, offsetY:-y*scale})` into a canvas sized to the box.
  6. Cache the boxes per document.
- Run the scan **before** any dark or sepia filter.
- pdf.js already honors the PDF CropBox as `page.view`. The trim is on top of that.

## 6. Recommended defaults

**Layout at 960×540 dp** [computed]:
- **Outer safe margins:** 48 dp left/right and 27 dp bottom, per Google's 5% rule. The page background color bleeds to the screen edge.
- **Top band:** 44 dp, holding the progress line plus a status line. Keep the same layout whether the bar is shown or hidden so text never reflows; hiding only fades the band.
- **Spread:** two text columns of **408 dp** each with a **48 dp gutter** (960 − 2·48 − 48 = 816 → 2 × 408).
  - Draw no seam. A faint 1 dp divider at 6% opacity of the text color is optional.
  - Inner page margin is the half-gutter (24 dp per page). Outer margin is the 48 dp safe margin.
  - foliate-js mapping: `max-column-count=2`, `max-inline-size≈408px` (CSS px = dp in a WebView at density 2), `gap` ≈ 48/864 ≈ 5.5%, `margin` = top/bottom band. foliate-js defaults for comparison are `--_gap: 7%`, `--_margin: 48px`, `--_max-inline-size: 720px`, `--_max-column-count: 2` ([paginator.js](https://github.com/johnfactotum/foliate-js/blob/main/paginator.js)).
- **Text block height:** 540 − 44 − 27 = 469 dp.

**Font:** **Literata** variable (OFL), regular weight 400, rising to 450–500 in Dark if strokes look thin **[unverified, tune]**.
- Alternates offered in the Font menu: Source Serif 4, Bitter, Atkinson Hyperlegible Next.
- UI chrome uses system Roboto or Atkinson Hyperlegible Next.
- Settings: line-height **1.5**, paragraph spacing 0.5–1 em or first-line indent, left-aligned or justified with hyphenation on.
- With full justification, enable `hyphens: auto` to limit rivers, because WCAG 1.4.8 discourages justification. Default to **justify + hyphenate**, matching Foliate, and offer "ragged".

| Step | Size (dp) | x-height ∠ at 2 / 2.5 / 3 m | ~cpl per 408 dp column (Literata) | lines/page @1.5 |
|---|---|---|---|---|
| 1 | 16 | 0.35° / 0.28° / 0.23° | 55 | 19 |
| 2 | 18 | 0.39° / 0.31° / 0.26° | 49 | 17 |
| **3 (default)** | **20** | 0.44° / **0.35°** / 0.29° | **44** | 15 |
| 4 | 22 | 0.48° / 0.38° / 0.32° | 40 | 14 |
| 5 | 25 | 0.54° / 0.44° / 0.36° | 35 | 12 |

- **Target is 40–55 characters per line per page**, with a default of about 44.
- A spread at TV-legible sizes can't reach the "55 cpl" figure without going below 0.3°. Step 1 is the option for readers who sit close.
- The trade-off: each step up costs about 10% of cpl and about 1–2 lines.

**Theme colors.** Contrast ratios are computed with the WCAG formula and measured against bg.

| Token | Sepia (default) | Dark | Light |
|---|---|---|---|
| bg | `#F4ECD8` | `#1C1B1F` | `#F7F7F4` |
| text | `#3D2F23`: **10.95:1** | `#E2DCD2`: **12.56:1** | `#1E1E1E`: **15.53:1** |
| dim text (status line, page nos.) | `#7A6650`: 4.64:1 | `#9A948B`: 5.70:1 | `#6B6B6B`: 4.97:1 |
| accent / progress fill | `#A65A2A`: 4.33:1 | `#E0A458`: 7.85:1 | `#2F6DB5`: 4.92:1 |
| progress track | text @ 15% alpha | text @ 18% alpha | text @ 12% alpha |
| focus fill (button bg when focused) | = text `#3D2F23` | = text `#E2DCD2` | = text `#1E1E1E` |
| focused label | = bg | = bg | = bg |

The reasoning behind these values:
- Body text clears AAA 7:1 everywhere.
- Dim text clears AA 4.5:1.
- Accents clear 1.4.11's 3:1.
- Neither pure white nor pure black is used, in line with TV Material.
- Sepia is darker than Foliate's 7.24:1 to compensate for viewing distance and TV panel softness.
- Dark sits near TV Material's neutrals, slightly warmed.

**Top bar:**
- **Progress line:** 3 dp tall (6 px at 1080p, which reads as a hairline from 2.5 m), full width inside the 48 dp side margins, accent fill on track, square ends, no animation except a 150 ms width ease on page turn.
- **Status line:** about 13 dp tall, Roboto or Atkinson at 13–14 sp in dim text, centered. Example: "Chapter 7 · Pages 212–213 of 500 · 42%". It sits 8 dp below the progress line, with the band baseline at about 36 dp. Use tabular numerals so the line doesn't jitter.
- **Hidden state:** the band fades to 0 opacity over 200 ms. An option keeps only the progress line.

**Focus styling** (when Up focuses the bar):
- Buttons are pills 32 dp tall with 16 dp horizontal padding, a 14 sp label (LabelLarge 14/20), and 12 dp spacing.
- **Unfocused:** transparent with a dim-text label.
- **Focused:** filled with the text color, label in the bg color, **scale 1.05** (Google's middle default), 150 ms ease-out, plus a 2 dp outline in the accent color at 2 dp inset-offset.
- The focused/unfocused pixel change equals the text contrast (≥ 10.9:1), which satisfies WCAG 2.4.13's ≥ 3:1 and 2 px perimeter.
- **Pressed:** scale 1.0 and fill at 85%.
- Only one focused element at a time. Back/Down returns focus to the page. Never leave the bar in a "focused but invisible" state.

**PDF defaults:**
- Auto-trim on, using a median odd/even box.
- Fit two trimmed pages into the 816 × 469 dp area.
- Sepia uses `multiply` blending.
- Dark uses pdf.js `pageColors` = Dark bg/text for text-heavy PDFs, with a per-document toggle to "keep images" that falls back to `invert(1) hue-rotate(180deg)` or Light.
- WebView algorithmic darkening is off.

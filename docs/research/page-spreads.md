# Page spreads on a TV: one page or two, and how to pair them

Context: 65" Google TV, 960×540 dp, viewed from 2–3 m, remote control (→ next, ← previous). EPUB through foliate-js, PDF through pdf.js, both in an Android WebView. The earlier layout (see `tv-reader-visual-design.md`): 48 dp side safe margins, two 408 dp text columns with a 48 dp gutter, Literata 20 dp, line-height 1.5, a 469 dp tall text block, about 44 characters per line.

Status labels (same as the visual-design doc):
- **[verified]**: read in the primary source (spec text or source code).
- **[computed]**: my own arithmetic, with the method shown.
- **[unverified]**: I could not confirm it in a primary source.

Source code was read from `main`/`master` on 2026-10-09: foliate-js [`paginator.js`](https://github.com/johnfactotum/foliate-js/blob/main/paginator.js), [`fixed-layout.js`](https://github.com/johnfactotum/foliate-js/blob/main/fixed-layout.js), [`epub.js`](https://github.com/johnfactotum/foliate-js/blob/main/epub.js), [`view.js`](https://github.com/johnfactotum/foliate-js/blob/main/view.js); pdf.js [`web/pdf_viewer.js`](https://github.com/mozilla/pdf.js/blob/master/web/pdf_viewer.js), [`web/ui_utils.js`](https://github.com/mozilla/pdf.js/blob/master/web/ui_utils.js). LibKey was not available in this session, so no LibKey links are given.

---

## 1. One page or a two-page spread?

**Arithmetic on the 864 dp usable width** [computed]. Literata's average advance is 0.462 em, so 20 dp gives about 9.24 dp per character, spaces included. Lines per page = floor(469 / (font size × 1.5)). Words ≈ characters / 6 (about 5 letters plus a space). Time per press assumes 260 wpm, the adult silent-reading mean for fiction (238 wpm for non-fiction) from Brysbaert 2019, a meta-analysis of 190 studies, *J. Memory & Language* 109:104047, [doi:10.1016/j.jml.2019.104047](https://doi.org/10.1016/j.jml.2019.104047) [verified via abstract].

| Layout | cpl | Lines | Chars / screen | Words / screen | Seconds per → at 260 wpm |
|---|---|---|---|---|---|
| **A. Two 408 dp columns, 20 dp** (current plan) | 44 | 15 ×2 | ~1,320 | ~220 | ~51 |
| B. One 864 dp column, 20 dp | **94** | 15 | ~1,400 | ~234 | ~54 |
| C. One 408 dp column centered, 20 dp (228 dp empty each side) | 44 | 15 | ~660 | ~110 | ~25 |
| D. One 610 dp column centered, 20 dp (175 dp empty each side) | 66 | 15 | ~990 | ~165 | ~38 |
| E. One 864 dp column, **28 dp** (x-height 0.49° at 2.5 m) | 67 | 11 | ~735 | ~122 | ~28 |
| F. One 864 dp column, 24 dp | 78 | 13 | ~1,010 | ~169 | ~39 |

**What the evidence and conventions say:**
- **Bringhurst**, *The Elements of Typographic Style* §2.1.2: "Anything from 45 to 75 characters is widely regarded as a satisfactory length of line"; "The 66-character line … is widely regarded as ideal"; "For multiple column work, a better average is 40 to 50 characters." Quoted from the authorised web adaptation, [webtypography.net/2.1.2](https://webtypography.net/2.1.2) [verified there; printed book not checked]. Layout A (44 cpl in two columns) sits inside Bringhurst's multi-column range. Layout B (94 cpl) is well outside his single-column range.
- **WCAG 1.4.8 (AAA)** asks for a way to get lines of 80 characters or fewer ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#visual-presentation)) [verified]. Layout B breaks this. A, D, E and F meet it.
- **Screen-reading studies.** Dyson 2004 reviews them and finds longer lines tend to be read faster while moderate lengths are preferred ([doi:10.1080/01449290410001715714](https://doi.org/10.1080/01449290410001715714)) [verified via abstract, per the earlier doc]. Dyson & Kipping 1997, "The legibility of screen formats: are three columns better than one?" (*Computers & Graphics* 21(6):703–712, [doi:10.1016/S0097-8493(97)00048-4](https://doi.org/10.1016/S0097-8493(97)00048-4)), is reported to find one wide column read faster but narrow multiple columns preferred **[unverified: secondary summaries only]**. Those studies used desktop monitors at arm's length with scrolling, not paginated TV reading at 2.5 m.
- **Braganza et al. 2009** (WWW '09, [doi:10.1145/1526709.1526821](https://doi.org/10.1145/1526709.1526821)) compared one vertically scrolled column with window-height columns scrolled horizontally ("seems well-suited to multi-column layout on electronic devices") on a desktop monitor [abstract verified via OpenAlex]. The detailed results are **[unverified]** because the full text was not accessible.
- **No study found** on reading long-form text on a TV at 2–3 m in either layout **[unverified]**. Everything for this setting is an inference from print conventions and desktop studies.

**Reading the table** [computed / reasoned]:
- **B** fits about as many words as A, but each line is twice as long. Long lines make the return sweep to the next line harder; that is the usual typographic argument against them [unverified as a TV-specific finding].
- **C** wastes half the screen and doubles the presses (one every 25 s).
- **D and E are the real single-page alternatives.** D is the Bringhurst-ideal 66 cpl with 175 dp margins. E uses the whole width at 66 cpl by raising the type to 28 dp, which is very large from the sofa (0.49° vs 0.35°). Both turn pages about every 30–40 s, compared with every 51 s for A.
- **A gives the most text per press of any layout that stays inside the conventional line-length ranges**, at the current type size. It also looks like an open book, which suits a 16:9 screen.
- Recommendation: keep **two columns as the default**. Offer a single-column option that uses layout D or E. In foliate-js that is `max-column-count=1` plus a `max-inline-size`; the grid already centers the column (section 2).

## 2. EPUB chapter boundaries in a spread

**Print convention.** The right-hand page (recto) is odd-numbered and the left-hand page (verso) is even-numbered ([Wikipedia: Recto and verso](https://en.wikipedia.org/wiki/Recto_and_verso), secondary). Non-fiction chapters traditionally open on a recto; fiction often opens on either side **[unverified: CMOS 18 §1.x text not accessible]**. The CMOS Q&A says: "A blank recto … is generally avoided unless it is part of a planned design. For instance, in a book where chapter openers take up an entire spread, if one chapter ends on a verso … page, the recto before the opener of the next will be blank" ([CMOS Q&A](https://www.chicagomanualofstyle.org/qanda/data/faq/topics/NoneoftheAbove/faq0007.html)) [verified]. Recto starts exist to suit a physical codex; nothing in the conventions demands them on screen.

**What EPUB says** [verified]:
- EPUB 3.3 §8.2.2.4 ([epub-33](https://www.w3.org/TR/epub-33/#page-spread)): by default the reading system fills the spread with "the next EPUB content document in the next available unpopulated viewport". `rendition:page-spread-left/right/center` override this per spine item. These properties "apply to both pre-paginated and reflowable content. They only apply when the reading system is creating synthetic spreads."
- EPUB RS 3.3 §8.1.1.4 ([epub-rs-33](https://www.w3.org/TR/epub-rs-33/)): "Reading systems MUST honor rendition:page-spread-* properties on both reflowable and pre-paginated spine items (e.g., by inserting a blank page)". They "MUST take precedence over" CSS `page-break-before`.
- `rendition:spread` (none / landscape / both / auto, with portrait deprecated) is defined in the **fixed-layout** section (§8.2.2.3). For `auto`, "Reading systems MAY use synthetic spreads in specific or all device orientations" (RS §8.1.1.3).
- So for reflowable books the spec only obliges a reader to honor explicit `page-spread-*` hints. Most reflowable books carry none **[unverified: no survey; anecdotal]**.

**What readers do:**

| Reader | Reflowable spread behavior at a chapter (spine item) boundary | Source |
|---|---|---|
| **foliate-js** | Each section loads into its own iframe and is paginated alone. `pages = ceil(contentSize / size)`, where `size` is the whole two-column width. A new section therefore **always starts at the left column of a fresh spread**. If a chapter ends in the left column, the right column of that spread stays **blank**. `paginator.js` never reads `pageSpread`, so reflowable `page-spread-*` hints are **ignored** (only the fixed-layout renderer uses them). CSS `page-break-*` is rewritten to `column-break-*`, so in-chapter breaks move to the next column, not the next spread. | `paginator.js` (`expand`, `#beforeRender`, `#turnPage`, `#adjacentIndex`) [verified] |
| **Readium** (Kotlin) | Two-up reflowable is done with `columnCount` (auto/1/2), and fixed layout with `spread` (auto/never/always). The docs suggest one "dual-page" switch that sets both. In the legacy navigator each resource is its own WebView page, so a chapter starts on a new screen at the left column **[inferred; not traced in code]**. | [preferences guide](https://github.com/readium/kotlin-toolkit/blob/main/docs/guides/navigator/preferences.md) [verified]; Readium CSS `--USER__colCount`, which "behaves as `1`" by default ([CSS12](https://github.com/readium/readium-css/blob/master/docs/CSS12-user_prefs.md)) [verified] |
| **KOReader** (crengine) | "Two Columns" (`visible_pages = 2`): "Render the document on half the screen width and display two pages at once". The book is one continuous page stream. Each spine item (`DocFragment`) gets `page-break-before: always`, which starts a **new page, not a new spread**, so a chapter can open in the right column. Spreads are kept odd-first (`odd_or_even_first_page = 1`). Tweaks exist: "Avoid blank page on chapter end", "New page on <H1>/<H2>…". | [creoptions.lua](https://github.com/koreader/koreader/blob/master/frontend/ui/data/creoptions.lua), [readerrolling.lua](https://github.com/koreader/koreader/blob/master/frontend/apps/reader/modules/readerrolling.lua), [css_tweaks.lua](https://github.com/koreader/koreader/blob/master/frontend/ui/data/css_tweaks.lua) [verified] |
| **Apple Books** | It shows two pages in landscape on iPad/Mac. Whether chapters start on a new spread, a new page, or a recto is **[unverified]**: not documented in the Asset Guide. | — |

**Conclusion for v1.** Use foliate-js's built-in "new chapter = new spread, left column" behavior. It costs nothing, is predictable, and never puts a chapter opening on the right next to the previous chapter's tail. The cost is a blank right column at roughly half of all chapter ends, which is acceptable on screen and is what Foliate users already see. Forcing recto (right-column) starts would cost more blank pages, and foliate-js doesn't support it. Honoring reflowable `page-spread-right` would need a paginator patch: insert a blank leading column in that section. Defer it.

## 3. Images

**Reflowable (foliate-js), out of the box** [verified, `paginator.js` `setImageSize`]:
- Every `img, svg, video` gets `max-height: <viewport height − 2·margin>`, `max-width: 100%` of the column, `object-fit: contain` and `break-inside: avoid`.
- So a "full-page" image is **scaled to fit one column** (408 × 469 dp) and pushed to the next column if it doesn't fit. A portrait cover or plate fills one page of the spread, much like a printed plate.
- **Spanning both columns** would need CSS `column-span: all`. In a height-constrained, paginated multicol container its behavior is engine-specific and tends to break the column flow; foliate-js doesn't use it **[unverified: not tested in Android WebView]**. Don't span.
- A **landscape image** confined to 408 dp shows at about 408 × 230 dp, which is small at 2.5 m [computed]. Better: an "OK on image → full-screen viewer" overlay at 864 × 469 dp. This is an app-level feature (foliate-js reports click events from the iframe).
- A chapter that is only an image, such as a cover XHTML, becomes a spread with the image on the left and an empty right column (section 2).

**Fixed layout (`rendition:layout` pre-paginated)**. foliate-js switches to `foliate-fxl` ([view.js](https://github.com/johnfactotum/foliate-js/blob/main/view.js), [fixed-layout.js](https://github.com/johnfactotum/foliate-js/blob/main/fixed-layout.js)) [verified]:
- Pairs spine items into spreads, honoring `page-spread-left/right/center`.
- `rendition:spread none` puts every page alone, centered.
- An unhinted **first** page goes in the **right** slot in LTR (left in RTL), so the cover stands alone and pairs follow 2–3, 4–5. This matches Apple's Asset Guide: "the first page of a left-to-right paginated book … will be on the right side of the spread. … Generally, this first page is the cover page" ([Setting Up the Document](https://help.apple.com/itc/booksassetguide/en.lproj/itc250e186b9.html)) [verified].
- Apple/Kobo `display-options.xml` `open-to-spread=false` is honored, forcing the first page to the right [verified, `epub.js`].
- It goes single-page only when the container is portrait and `spread` is neither `both` nor `portrait`. On a landscape TV, every fixed-layout book except `spread: none` shows as spreads.
- Scaling defaults to fit-page across both pages.
- For comparison, Readium's newer fixed-layout resolver pairs unhinted pages starting from the **left**, so there is no cover-alone default without hints ([LayoutResolver.kt](https://github.com/readium/kotlin-toolkit/blob/main/readium/navigators/web/fixedlayout/src/main/kotlin/org/readium/navigator/web/fixedlayout/layout/LayoutResolver.kt)) [verified]. Readers disagree here; foliate-js's choice matches print and Apple.
- **Effort:** none. FXL spreads work out of the box.

## 4. PDF spreads

**pdf.js modes** [verified, `ui_utils.js`, `pdf_viewer.js`]:
- `SpreadMode.NONE = 0`, `ODD = 1`, `EVEN = 2`.
- `ODD` starts each spread on an odd page: **1–2, 3–4, …**, which puts odd pages on the **left**.
- `EVEN` starts each spread on an even page: **1 alone, 2–3, 4–5, …**, which puts odd pages on the **right**.
- The PDF's own `/PageLayout` is mapped as: `TwoPageLeft` → PAGE scroll + ODD, `TwoPageRight` → PAGE scroll + EVEN, `SinglePage` → PAGE + NONE (`apiPageLayoutToViewerModes`). Read it with `pdfDocument.getPageLayout()`.
- In `ScrollMode.PAGE` with a spread mode, `nextPage()` advances by 2 when the whole partner page is visible.
- One spread mode applies to the whole document; pdf.js can't change it per page.

**Which matches printed books.** **EVEN** does. Print puts odd pages on rectos (right), so page 1 (the cover or title) stands alone on the right and 2|3 face each other [verified convention, see section 2]. This is also Apple's FXL default; Readium's PSPDFKit adapter exposes it as `offsetFirstPage`, documented as "if the first page should be displayed in its own spread" ([PsPdfKitPreferences.kt](https://github.com/readium/kotlin-toolkit/blob/main/readium/adapters/pspdfkit/navigator/src/main/java/org/readium/adapter/pspdfkit/navigator/PsPdfKitPreferences.kt)) [verified].

**When each looks right** [reasoned]:
- **Scanned or print books, magazines, comics with a cover**: use **EVEN**. True two-page spreads (maps, art) only line up in this mode.
- **Papers, reports, theses, generated documents** with no cover and no facing-page design: either mode works. **ODD** avoids a lonely page 1 and keeps "pages 1–2" numbering intuitive.
- **Heuristic:** honor `/PageLayout` if set. Otherwise use EVEN if page 1 differs in size or aspect from page 2 or the document has more than about 40 pages with a "book-like" trim (not Letter/A4), and ODD for everything else. Let the user flip it per document (store it with reading position) **[unverified heuristic]**.

**Landscape pages (slides).** Fit inside 816 × 469 dp [computed]:
- One 16:9 slide fills about 816 × 459 dp.
- Two slides side by side are about 408 × 230 dp each, a quarter of the area.
- **Show landscape pages one per screen** (`SpreadMode.NONE`): if the median page aspect (w/h) is above about 1.0, use NONE.
- Mixed documents (a portrait report with landscape fold-outs) need per-page logic that pdf.js lacks. Accept NONE or the chosen spread mode for the whole document in v1.

**Size check for portrait PDFs** [computed]:
- A US-Letter page fitted to 469 dp height is scaled about 2.5×. 10 pt body text then has an x-height of about 4 mm, **0.09° at 2.5 m, below the 0.2° critical print size**.
- A portrait page is height-limited either way, so **two-up costs nothing in text size**. One-up height-fit is just as small and only wastes width.
- Auto-trim margins (previous doc) gives about 0.11°. Single-page **fit-width** with half-screen scroll steps reaches about 0.22–0.29° (trimmed).
- So the default for papers can be the spread, but a "fit width, scroll by half page" mode is the only way to read 10 pt PDFs from the sofa. Consider it for v1.1 (pdf.js `ScrollMode.VERTICAL` + `currentScaleValue = "page-width"` + programmatic scroll).

## 5. Page turn: whole spread or one page?

| Reader | → in two-up mode | Source |
|---|---|---|
| foliate-js reflowable | Scrolls by `this.size` (the whole container), so it moves a **whole spread**. It moves to the next section's first spread at chapter end. | `paginator.js` `#scrollNext` [verified] |
| foliate-js fixed layout | `next()` → `goToSpread(index + 1)` in landscape, a **whole spread**. It steps through single pages only in portrait. | `fixed-layout.js` [verified] |
| pdf.js PAGE scroll + spread | `nextPage()` advances **2** (one spread) | `pdf_viewer.js` `#getPageAdvance` [verified] |
| KOReader two columns | Moves `diff × getVisiblePageNumberCount()` = **2 pages** | `readerrolling.lua` `onGotoViewRel` [verified] |
| Apple Books (landscape) | Whole spread **[unverified]** | — |

**Shifting by one page (sliding window: 1–2 → 2–3)**:
- No reader above does this.
- It breaks page pairing: true spreads and facing images stop lining up.
- It forces a re-render of both columns on every press.
- It halves the text advanced per press.
- Its one advantage is that the eye always continues at the left: the right column moves to the left, so you never "jump back" across the screen. A whole-spread turn needs a big right-to-left saccade every ~50 s, the same as turning a printed page.
- **Use whole-spread turns.** That is what every engine you use already does, so it is free.

---

## Recommended behavior (v1)

| # | Rule | foliate-js / pdf.js effort |
|---|---|---|
| 1 | **Default to a two-column spread** for reflowable EPUB: 2 × 408 dp, 48 dp gutter, about 44 cpl, 15 lines, about 220 words per press (about 50 s at 260 wpm). | Config only: `max-column-count=2`, `max-inline-size≈408px`, `gap≈5.5%`. Note that foliate-js's portrait rule (`--_max-column-count-portrait: 1`) never triggers on a TV. |
| 2 | **Offer "Single page"** as a setting: one centered column of about 610 dp (66 cpl) at the current size, *not* a full-width 94 cpl line. | Config only: `max-column-count=1`, `max-inline-size≈610px`. The grid centers it. |
| 3 | **Each EPUB chapter (spine item) starts a new spread, in the left column.** A short last spread leaves the right column blank (draw nothing there, keep the page background). No recto-forcing. | Free: built-in foliate-js behavior. Honoring reflowable `page-spread-right` would need a paginator patch to insert a blank column; defer. |
| 4 | **Images fit inside one column** (max 408 × 469 dp, contain, no splitting). Add **OK on an image → full-screen image view** for wide figures and maps. | Fitting is built in (`setImageSize`). The full-screen viewer is app work, done from the iframe click event; about a day. |
| 5 | **Fixed-layout EPUB:** spreads per `rendition:spread` and `page-spread-*`. An unhinted cover stands alone on the right, then 2–3, 4–5. `spread: none` gives one centered page. Fit-page scaling. | Free: `foliate-fxl` does all of it. |
| 6 | **PDF, portrait pages:** `ScrollMode.PAGE` + spread. Honor `/PageLayout` first. Otherwise use **EVEN** (cover alone, then 2–3: print convention) for book-like PDFs and **ODD** (1–2, 3–4) for papers and reports. Per-document toggle on the top bar, persisted. | Small: set `pdfViewer.scrollMode = 3` and `spreadMode`, read `getPageLayout()`, add a heuristic plus a toggle. |
| 7 | **PDF, landscape pages** (median w/h > 1, e.g. slides): `SpreadMode.NONE`, **one page per screen**, fit-page. | Small: compute the aspect from `getPage(n).view` on 3–5 sample pages at open. |
| 8 | **→ / ← turn a whole spread** (two pages) everywhere. At a chapter end, → goes to the next chapter's first spread. Long-press or channel keys can jump by chapter (`nextSection()` / `prevSection()`). | Free: `view.next()/prev()`, `pdfViewer.nextPage()/previousPage()`. |
| 9 | **Status line shows the spread:** "Pages 212–213". Use the left page's number for progress. | Small: foliate-js `relocate` gives the location. For PDF use `currentPageNumber` and its partner. |
| 10 | **(v1.1)** "Fit width" PDF mode, one page scrolled in half-screen steps per →, because whole-page PDF views put 10 pt text at about 0.1°, below the 0.2° legibility threshold at 2.5 m. | Moderate: VERTICAL scroll, `page-width` scale, custom step logic. |

Open questions to test on the TV:
- Is 50 s between presses comfortable, or does the single-column option get used more?
- Do blank right columns at chapter ends feel like a bug? If so, consider a small centered "◆" or the next chapter's title as a placeholder; this is app-drawn, not a foliate-js feature.

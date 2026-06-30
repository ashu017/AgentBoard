---
name: seo-audit
description: Audit a page or content for SEO, AEO (answer engines), and GEO (generative engines) and produce a scored report with falsifiable recommendations. Use when asked to audit/score a page's discoverability, check sitemap.xml/robots.txt, validate JSON-LD, or assess snippet/citation readiness. Read-only by nature — pairs with content-optimize for the fixes.
---

# seo-audit — score a page for SEO / AEO / GEO

Produce a **scored, evidence-backed audit** of a page or piece of content across three
competencies. This skill *measures and reports*; the `content-optimize` skill applies the
fixes. Run the PERCEIVE → ANALYZE → VALIDATE loop here; hand ACT to content-optimize.

## Steps

1. **PERCEIVE — capture the real rendered state.**
   - Fetch the page (WebFetch for a remote URL; serve and read locally otherwise). Extract:
     the full heading outline, `<head>` metadata, every JSON-LD block, internal/external
     links, and `<img>` alt/dimensions.
   - If the page runs locally, run the gstack `/browse` lighthouse audit
     (`/browse lighthouse <url>`) for Core Web Vitals and the Lighthouse SEO score.
   - Fetch `/{sitemap.xml,robots.txt}` and confirm they resolve.

2. **ANALYZE — score each criterion** pass / weak / fail with the evidence you observed.

   **SEO**
   - [ ] Exactly one `<h1>`; heading levels never skipped; semantic landmarks present.
   - [ ] `<title>` ~50–60 chars, unique; meta `description` ~150–160 chars.
   - [ ] Self-referential `<link rel="canonical">` resolves.
   - [ ] Open Graph (`og:title/description/image/url/type`) + Twitter Card present; OG
         image reachable.
   - [ ] Every JSON-LD block parses and is schema.org-valid.
   - [ ] `sitemap.xml` lists only canonical public URLs; `robots.txt` resolves, points to
         the sitemap, and `Disallow`s private paths (`/board`, `/board/*`); authed routes
         also `noindex`.
   - [ ] Internal links use descriptive anchors; no orphans/broken links.
   - [ ] Images have meaningful `alt` (decorative `alt=""`) and width/height set.
   - [ ] **Core Web Vitals: LCP < 2.5 s, INP < 200 ms, CLS < 0.1.** (INP replaced FID —
         never report FID.) Record the measured numbers.
   - [ ] E-E-A-T: page answers **Who / How / Why** (Google's heuristic).

   **AEO**
   - [ ] Key questions answered in the first 1–2 sentences (~40–60 words), snippet-shaped.
   - [ ] Question-phrased headings that mirror real queries.
   - [ ] `FAQPage` + `HowTo` JSON-LD present **and matching the visible content**.
   - [ ] Report the accuracy note: Google deprecated FAQ/HowTo **rich results** (2023) so
         they no longer render as SERP rich snippets — but keep the schema, because answer
         engines and LLMs still parse it. Don't promise Google rich-result display.

   **GEO**
   - [ ] Opens with an extractable one-sentence definition a model can quote verbatim.
   - [ ] Key explanations are self-contained **answer blocks ~134–167 words**.
   - [ ] Claims are declarative and factual, not hype.
   - [ ] **Attribution density:** factual claims carry sourcing/links where it matters.
   - [ ] **Entity presence + consistency:** product and key entities named identically
         throughout.
   - [ ] Vague, un-citeable marketing fluff flagged for rewrite or cut.

3. **VALIDATE — confirm findings are real.** Re-parse JSON-LD against schema.org; confirm
   the structured data matches visible text word-for-word where it claims to; confirm the
   canonical and OG image actually resolve. Drop any finding you can't reproduce.

4. **Report.** Emit a per-competency scorecard (SEO / AEO / GEO), each criterion marked
   pass / weak / fail with the observed evidence and the measured CWV numbers. End with a
   prioritized fix list. **Every recommendation carries a falsifiability check**: *how we'd
   know it failed* + a **leading indicator** to watch (e.g. "Rich Results Test reports 0
   valid FAQ items"; "an LLM asked to define the product hedges instead of quoting the
   lead sentence"). A recommendation you can't falsify is an opinion — label it as such.

## Boundaries

- Read-only audit. Don't edit files here — emit the fix list and hand to `content-optimize`.
- Don't fabricate scores or claim a deprecated rich-result will render. Accuracy over
  optimism.

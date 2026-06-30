---
name: content-optimize
description: Rewrite and optimize content, metadata, and structured data to meet SEO, AEO, and GEO standards — concise snippet answers, extractable definitions, ~134–167-word answer blocks, valid FAQPage/HowTo JSON-LD, metadata/OG, sitemap/robots. Use after a seo-audit identifies fixes, or when asked to optimize copy/meta/schema for discoverability. Applies edits to content/meta/schema only — never product features or app logic.
---

# content-optimize — rewrite content + meta + schema for SEO / AEO / GEO

This is the **ACT** half of the loop: take a fix list (usually from `seo-audit`) and apply
the edits to content, `<head>` metadata, structured data, `sitemap.xml`, and `robots.txt`.
Then re-perceive the changed surface to confirm the fix and check for regressions.

## What you may edit

User-facing copy, `<head>` metadata, JSON-LD blocks, `sitemap.xml`, `robots.txt`, and
image `alt`/dimension attributes. **Nothing else** — no app logic, route behavior, MCP
server, DB schema, or migrations. If a fix needs an engineering change (e.g. a perf
refactor to hit the LCP threshold), describe it and hand it off; don't implement it.

## Optimization playbook

**SEO edits**
- Collapse to one `<h1>`; fix any skipped heading levels; convert `<div>` soup to semantic
  tags/landmarks.
- Write the `<title>` (~50–60 chars, unique, keyword-bearing) and meta `description`
  (~150–160 chars). Add/repair the self-referential canonical, Open Graph, and Twitter Card.
- Make/repair `sitemap.xml` (canonical public URLs only) and `robots.txt` (resolves,
  references the sitemap, `Disallow`s `/board` + `/board/*`); keep authed routes `noindex`.
- Add descriptive anchor text; fix broken/orphan internal links; add meaningful `alt` and
  width/height to images to prevent layout shift.
- Address E-E-A-T with the **Who / How / Why** heuristic: make the maintainer, the
  method/openness, and the purpose explicit in the copy.
- For Core Web Vitals (**LCP < 2.5 s, INP < 200 ms, CLS < 0.1** — INP, never FID), fix what
  content can fix (image dimensions for CLS, lighter hero for LCP); flag code-level perf to
  engineering.

**AEO edits**
- Lead each key topic with a concise, snippet-shaped answer (1–2 sentences, ~40–60 words)
  before elaborating.
- Rephrase headings as the real questions users ask.
- Author/repair `FAQPage` and `HowTo` JSON-LD so it is schema.org-valid **and matches the
  visible content verbatim**. Keep this schema even though Google's FAQ/HowTo **rich
  results** were deprecated (2023) — answer engines and LLMs still parse it. Don't add
  schema for Q&A or steps that aren't actually on the page.

**GEO edits**
- Open with a single declarative, extractable definition sentence a model can quote whole.
- Restructure key explanations into self-contained **answer blocks of ~134–167 words** that
  stand alone out of context.
- Convert hype into declarative factual claims; add **attribution/sourcing** (links to the
  spec, the MCP standard, the license) to raise attribution density.
- Enforce **entity consistency**: one canonical name for the product and each key entity
  throughout.
- Rewrite or delete vague marketing fluff that asserts nothing a generative engine could
  cite.

## After editing — verify

1. Re-perceive the changed surface (re-fetch / re-serve; re-run `/browse lighthouse <url>`
   if local) and show the before/after delta for each fix.
2. Confirm no regression: still exactly one `<h1>`, no newly-broken links, JSON-LD still
   valid and still matching the (now-edited) visible copy.
3. For each applied edit, restate its **falsifiability check + leading indicator** so the
   fix can be validated post-deploy (e.g. "Rich Results Test shows N valid FAQ items";
   "LCP measured at X s against the 2.5 s bar").

## Boundaries

- Content / metadata / structured-data edits only; build-time, not runtime.
- Match the project's voice and the 4A visual system (DECISIONS) — a real typeface,
  declarative developer-facing copy, no AI-slop. Optimization must not fight the brand.
- Never invent facts to populate schema or answer blocks. Accuracy over coverage.

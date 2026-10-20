# Cmd J transcript search ranking

Status: Implemented for review units 1–4. See [validation and release budgets](#implementation-validation). Host retrieval recall remains a separate change.

## Decision

Rank chats found through their transcript alongside other Cmd+J results. Preserve existing destination rules and strong ordinary matches. Promote a transcript result above weak ordinary matches only when one visible original excerpt proves every original query token and quoted phrase literally.

The prerequisite is trustworthy text: the host returns one bounded, contiguous slice of an original indexed message. The renderer verifies it, selects a displayable proof window, and applies a Cmd+J-local transcript tier. After interaction, preserve the committed list prefix the user has observed while allowing better late results into unseen slots.

## Problem and current behavior

Cmd+J searches names and other fields synchronously, then asks this desktop's session index for transcript matches. The request is debounced by 120 ms after the deferred query, requests at most 100 sessions, and retains only sessions mapping to eligible open or sleeping terminal panes.

The current merge enriches ordinary matches without changing position. Index-only hits have `rank: null` and `qualityClass: null` and follow every ordinary Open Tabs result in index order. A weak name therefore always beats useful content, and transcript evidence cannot improve Open Tabs' section leadership. Selected identity alone also does not preserve position or the pointer target.

The existing snippet is a presentation artifact. FTS can insert markers and ellipses, and identifier-only retrieval can return synthetic identifier-shadow text. Joined shadow components can manufacture a quoted phrase that never appeared in the conversation; clipping can create an apparent token boundary. The host must supply source text rather than make the renderer infer provenance.

For example, `token refresh race` should surface a conversation discussing that problem before a loose refresh-related label, while an exact workspace name remains predictable.

## Design rationale

- **Original source is necessary.** [`identifierShadowText()`](../src/main/ai-vault-search/session-search-identifier-split.ts) turns `token_refresh unrelated words race_condition` into `token refresh race condition`, inventing adjacency for `"refresh race"`. Snippets can also clip words, and the renderer's [`marker parser`](../src/renderer/src/components/right-sidebar/ai-vault-search-snippet-marks.ts) treats literal `[[...]]` as markup. One original-text field fixes the provenance problem without more marker heuristics.
- **The renderer owns proof.** The host supplies text from the selected indexed row; the renderer owns the original query, matching, highlight ranges, and available width. This avoids a second completeness classifier or host ranking model.
- **Visible proof is a deliberate product requirement.** Promotion must explain itself in the displayed line. Ranking from a larger excerpt while truncating away matching terms would simplify implementation, but changes that promise. Width-dependent eligibility follows from visible proof; bounded measurement and its performance budget are specified below.
- **Late results must remain discoverable.** A user can press Down during the debounce. Freezing membership then would hide transcript-only arrivals; preserving every capped row would send them to overflow. Protecting the observed prefix leaves unseen capacity useful. Reserving excerpt height separately prevents text enrichment from moving pointer targets even when order stays fixed.

The legacy FTS snippet requests 12 tokens and inserts `…` for omitted context. Rejecting every such snippet would lose normal long-message matches. Original-text extraction must allow compact interior proof to promote despite those legacy ellipses; zero false promotions achieved by promoting almost nothing is insufficient.

## Original-excerpt contract prerequisite

Add this optional field to search evidence, propagating it through engine types, public response validation, and service/transport projections:

```ts
originalExcerpt?: { text: string }
```

Its presence is required for promotion; optionality supports mixed client/host versions. The contract is:

- `text` is a verbatim, contiguous slice from one original indexed `user_text`, `assistant_text`, or `tool_text` column allowed by the existing scope. No inserted markers, ellipses, joined fragments, or identifier-shadow text. Literal brackets and ellipses written in the message remain source characters.
- Return at most 512 Unicode code points without splitting a surrogate pair. This bound differs from JavaScript string length and renderer offsets, which use UTF-16 code units.
- Extract beside [`sessionSearchSnippet()`](../src/main/ai-vault-search/session-search-snippet.ts) from the already selected indexed row, using a bounded indexed-text read. Preserve current source/session joins, generation checks, and retention protections through the final content read. Do not reopen transcript files, search other messages, or migrate the index.
- Select context with a bounded scan of original-query literal anchors. Prefer a compact window covering more distinct anchors over the first common term. Retain neighboring source characters needed by token/identifier segmentation. Context selection is not proof.
- For shadow-only retrieval, inspect permitted original columns of that same bounded row for usable literal context. Return actual text or omit the field; never reconstruct the shadow.

Keep the legacy `snippet` unchanged for existing consumers. Missing, empty, invalid, or unusable original evidence leaves an eligible index hit unpromoted; the legacy snippet may still display. Older hosts remain useful without certifying promotion, and older clients ignore the additive field.

Slice edges and stored chunk edges certify no token/component boundary: [`message chunking`](../src/main/ai-vault-search/session-search-message-rows.ts) can force a cut inside a long token, and tool rows are capped. Establish required boundaries from retained source characters, including context needed by the existing segmenter. Conservatively reject proof touching an uncertain edge, even when it happens to be a true message boundary. Accept those false negatives instead of adding boundary booleans, host highlight ranges, host semantic proof, or original-message provenance migrations.

## Ranking policy

Existing destination precedence remains authoritative: recognized issue/review URLs, website navigation, eligible whole-field equality, and protection against an exact workspace name losing to a same-named settings page. Transcript evidence never creates an exact destination.

Within those safeguards, use four presentation bands:

| Band                     | Members                                                                                                | Within-band order                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Protected ordinary       | Existing `exact-intent`, `exact-visible`, `visible-prefix`, and `exact-evidence` matches.              | Existing ordinary comparator, including semantic rank, activity, position, stable identity, and existing destination precedence. |
| Complete transcript      | One visible original excerpt proves all free-text tokens and quoted phrases.                           | Original index ordinal, then stable identity.                                                                                    |
| Weak ordinary            | Existing `partial-evidence`, `fuzzy-evidence`, and other ordinary matches without a protected quality. | Existing ordinary comparator and tie-breaks.                                                                                     |
| Unproven transcript-only | Eligible index-only hits without complete displayable literal proof.                                   | Original index ordinal, then stable identity.                                                                                    |

Do not reorder ordinary qualities within either ordinary band. Some weak-before-strong ordinary orders can change across bands; review those reversals independently. Use fixed comparison keys and existing within-band comparison, without pair-specific exceptions, fabricated `PaletteDocumentRank`, score blending, or recency ahead of index ordinal.

Apply the adapter at both entity sorts: Open Tabs in [`worktree-jump-palette-open-tab-items.ts`](../src/renderer/src/components/worktree-jump-palette-open-tab-items.ts) and `worktreeItems` in [`use-worktree-jump-palette-open-tabs.ts`](../src/renderer/src/components/use-worktree-jump-palette-open-tabs.ts). Feed consistent effective strength into [`cmd-j-section-leadership.ts`](../src/renderer/src/lib/cmd-j-section-leadership.ts), retaining its stronger ordinary quality distinctions and destination safeguards rather than flattening them into one protected strength. Row order and section leadership must agree about the transcript band's position without rewriting existing within-band policy.

Record ordinary-only before/after fixtures for structured/fallback matches, complete fuzzy titles, weak supporting fields, destinations, prefixes, activity ties, and section leadership. Approved ordinary order is identical with transcripts absent, disabled, unavailable, failed, or in flight. Audit generic comparator callers, but keep their implementations and unrelated consumers untouched.

### Literal classification and merge

Implement one pure renderer classifier over `originalExcerpt.text` and the original query. Reuse `splitAiVaultSearchQuery` for recognized `repo:`/`path:` restrictions while preserving quotation information from its free-text `text`; reuse normalization, source-offset mapping, and token/identifier segmentation where they satisfy these rules:

1. Require at least one nonempty free-text token and every original token, including stop words and terms omitted by backend query caps. Operator values alone do not qualify. Repaired queries and retrieval routes do not define proof.
2. Require normalized whole tokens or whole identifier components with source-supported boundaries. Preserve segmentation before case folding: `refresh` may match `tokenRefresh` or `token_refresh`, but `art` cannot match `started`. Use existing NFC/case/whitespace normalization and offset mapping. Prefix, substring, compact, fuzzy, and spelling-repaired matches cannot certify.
3. Require every quoted phrase contiguously at valid boundaries, permitting existing NFC/case normalization and whitespace normalization only. No inserted words, reordered tokens, skipped punctuation, omitted spans, or cross-source assembly.
4. Require all proof to fit one contiguous display window at the actual shared excerpt width and highlighted typography. Unknown width or non-fitting proof means no promotion.

Return verified `MatchRange`s as half-open UTF-16 source offsets and preserve mappings through normalization/window selection. Legacy markers, debug fields, snippet length, and scores never enter certification. Marker-free original text can qualify; a marked synthetic snippet cannot. Display ellipses sit outside source text and supply no boundaries.

Select bounded deterministic windows, preferring the smallest contiguous span covering all required tokens/phrases, then source order. Consider repeated occurrences rather than fixing the first anchor; add context only when it fits. Incomplete hits retain best-effort context without transcript quality; never assign ordinary `partial-evidence` from partial transcript matches. Typo-route retrieval can promote only when original text independently proves the original query.

Retain response ordinals through classification and display-fit checks **before** per-tab deduplication. When sessions map to one tab, prefer complete displayable proof, then earliest ordinal; otherwise keep the earliest unpromoted hit. Never combine sessions, messages, columns, or fragments as proof.

Merge by existing host-aware palette identity. Retain ordinary and transcript signals separately in [`worktree-jump-palette-model.ts`](../src/renderer/src/components/worktree-jump-palette-model.ts), choosing the stronger under the same band policy. Preserve name highlights and the excerpt associated with the winning transcript candidate.

## Presentation foundation prerequisite

Transcript matches stay in Open Tabs. Keep existing labels, previews, bounded rendering, and overflow controls. Section leadership does not globally interleave all result types: a strong transcript may make Open Tabs lead while previews still give Workspaces first-screen space. Test row order and section leadership separately.

Use existing components and tokens from [STYLEGUIDE.md](STYLEGUIDE.md), with no new colors, type scale, or interaction mode. Empty queries retain recent-tab behavior.

### Excerpt geometry and measurement

Place excerpts beneath the complete title/badge line at a shared content width independent of title length, badges, result membership, and caps. Measure that width from the palette shell, independently of mounted candidates, and reserve a stable scrollbar footprint.

Choose windows with pure bounded logic, then verify them in one bounded out-of-flow batch using actual `HighlightedText` structure, font, highlight weight, spacing, and display ellipses. Cache by source/window, ranges, width, and typography for the display generation. Measure before sort and caps, including unmounted candidates. Limit work to at most 100 transcript candidates and a fixed bounded set of windows each; do not enumerate arbitrary substrings or mount → measure → rerank repeatedly.

Unknown width, unloaded typography, or non-fitting proof receives no promotion until valid fit exists. Explicit width/typography changes invalidate once and recompute; badges and membership do not change width. Never certify a full source excerpt and hide proof behind CSS truncation.

Font-load signals invalidate cached fits even when the CSS font declaration is unchanged. Each completed measurement batch replaces the receiver's fit snapshot.

Reserve one excerpt line plus spacing from the first render of a nonempty transcript-enabled generation, before deferred work/debounce, only for destinations eligible for local enrichment. Use existing host/live/sleeping/runtime rules and keep eligibility stable for surviving destinations within the generation; arriving destinations use the same predicate. Remote/ineligible rows pay no reservation cost. Empty/error responses retain eligible reservations. Text updates never change row height or wrap.

The merge owns one geometry decision per host-aware destination, including ineligible decisions, across title/transcript match transitions. A surviving row without reserved excerpt space cannot gain a line or promote from hidden proof.

After interaction, keep outer palette geometry, viewport, scrollbar, and heading/hint/control footprints stable during enrichment. Insert nothing above protected occurrences. Query changes, genuine removals, explicit resize/typography changes, and explicit See more expansion are layout exceptions.

### Committed observed prefix and caps

Invalidate the result generation immediately on raw query, filter, or search-policy changes, before deferred completion. Reject older responses and clear their presentation snapshot. Reset on close/reopen and visibility lifecycle changes as appropriate.

Before interaction, rank and commit rows/default selection atomically under existing destination and Create rules. On actual keyboard navigation, result hover/pointer interaction, or scrolling, capture the last committed list prefix through the furthest selected, hovered, or viewport-visible occurrence, including intervening rows, headings, hints, and controls. Partially visible occurrences count.

Capture **before** asynchronous membership changes apply; extend from committed layout on real navigation/scrolling. Observing already-replaced rows in a later layout effect is too late. Separate presentation interaction from Create's explicit-gesture signal: hover/scroll may protect presentation without authorizing Create. Programmatic cmdk callbacks do not pin or extend the prefix.

Reconcile before renderer caps:

1. Build the full currently available eligible, host-aware, deduplicated candidate map from ordinary results and the bounded transcript response.
2. Resolve protected occurrence keys against that map, reading live data. Lower rank is not removal; absent/ineligible destinations are removed. Preserve intentional occurrence identities without retaining stale row objects.
3. Reserve each section's cap slots for surviving prefix occurrences, retaining order, section fragments, headings, and control footprints even if leadership changes. Offscreen rows under the old cap are not automatically pinned.
4. Rank/fill remaining unseen suffix slots. Strong arrivals can replace unseen rows even at a previously full cap. Add continuation headings outside the protected prefix. Rendering a suffix or receiving a batch does not itself extend the prefix.
5. Compute hard overflow from unique eligible minus final unique rendered destinations per section. Derive preview hints from the same membership, distinguishing rendered continuation rows from hard overflow. Count merged sources and split section fragments once.

With 50 capped rows, a protected first viewport, and 20 stronger late hits, preserve the prefix and let stronger hits replace the unseen suffix. At unchanged capacity without duplicates, 20 destinations remain in overflow, but the new hits enter the navigable suffix. Free slots on genuine removal; increase capacity on explicit See more. Do not preserve all 50 merely because one Down key was pressed.

Freeze presentation, not activation authority: validate destinations normally, keep surviving selection, or choose a deterministic surviving neighbor after removal. Enter activates without waiting for the index. Rectangle and pointer-target stability, not identity/`scrollTop` alone, is the interaction contract.

## Implementation plan and PR order

Reuse existing matching, host-aware occurrence identities, section layout, and selection/list-entry lifecycle. Scope coordination to the current bounded, debounced transcript response and subsequent display or eligibility updates. Keep extraction, classification, measurement, ranking, and prefix reconciliation small; no general streaming-results or ranking framework is needed.

| Review unit                        | Scope and dependency                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Original-excerpt contract       | Optional field across engine/schema/projections, bounded extraction, retention and compatibility tests. Required for promotion; legacy snippets remain intact.                                            |
| 2. Ordinary-ranking adapter        | Independently reviewed ordinary reversals, both entity sorts, and consistent section leadership. Can be developed independently of PR 1.                                                                  |
| 3. Presentation foundation         | Shared-width excerpts, eligible reservations, bounded fit checks, immediate invalidation, committed prefix capture, and pre-cap reconciliation. Establish geometry/interaction behavior before promotion. |
| 4. Classifier and promotion        | Original-query classification, fit checks before per-tab deduplication, one-row merge, ordinal ordering, and transcript tier. Depends on PRs 1–3.                                                         |
| Separate host PR: retrieval recall | Eligibility before route success, cutoffs, fork folding, and paging; preserve bounded work and older peers.                                                                                               |

Extend [`worktree-jump-palette-transcript-matches.ts`](../src/renderer/src/components/worktree-jump-palette-transcript-matches.ts), the named entity sorts/model/leadership, [`worktree-jump-palette-workspace-tab-row.tsx`](../src/renderer/src/components/worktree-jump-palette-workspace-tab-row.tsx), [`use-worktree-jump-palette-sections.ts`](../src/renderer/src/components/use-worktree-jump-palette-sections.ts), and [`palette-section-render-cap.ts`](../src/renderer/src/components/cmd-j/palette-section-render-cap.ts).

## Scope and compatibility

Reuse consent, the 120 ms debounce, 100-hit bound, and cancellation. The original-excerpt prerequisite adds one optional response field through existing validation/transports, preserving transport content policies. No stream opcode, index migration, new setting, full-history browsing, remote fanout, or execution-host status producer is needed. Older hosts omit the field and cannot promote; missing provenance is never inferred from legacy text.

Attach local evidence only to local tabs whose original live/sleeping panes resolve through the existing index. Preserve host-aware identity, runtime-owner checks, local tabs while a runtime is focused, and folder workspaces without assuming Git. Remote tabs keep existing search paths; loss of contact is not process exit. Retain platform-aware shortcuts.

Host recall is separate. Eligibility currently follows route choice, cutoffs, folding, and paging: closed history can make a phrase route suppress an eligible all-term hit, or a closed fork suppress its open sibling. Apply eligible-session restrictions on the owning host before those decisions, with closed/open route/fork fixtures and mixed-version compatibility. Raising limits or repeated paging cannot recover already-suppressed candidates.

Defer richer explanations, highlight metadata, original-message boundary provenance, and remote expansion. Conservative interior-boundary proof needs none of them.

## Performance and evaluation

Bound host extraction to selected indexed rows/original columns and at most 100 excerpts of 512 Unicode code points. Reuse retained-string ownership utilities where needed so small excerpts do not retain large source strings; never reopen transcript files.

Normalize/classify once per query/display generation, measure bounded windows in one batch, then deduplicate/sort with small keys. Bound caches to the generation. Comparator calls perform no normalization, reads, or DOM measurement.

### Required before enabling promotion

A fixed-corpus evaluation and local release-budget evidence are recorded in [validation](#implementation-validation). Keep a small fixed corpus of realistic queries and judged useful destinations, comparing current and proposed behavior with the same page limit and debounce. Include exact navigation, distinctive phrases, broad words, identifiers, typos, long messages, closed history, and early navigation. Distinguish host recall omissions from renderer gains.

- **Correctness and interaction:** pass the [acceptance tests](#acceptance-tests), with zero literal false promotions in the corpus and regression fixtures. Verify target geometry and activation through early keyboard, hover, and scroll interaction.
- **Usefulness and density:** record first-screen useful-result rate, useful-arrival coverage after early interaction, and the number of visible rows lost to excerpt reservations. Judge usefulness independently of literal compliance: an incidental common-word mention can satisfy the classifier and still be a poor result.
- **Bounded performance:** compare representative host latency and renderer CPU/frame cost against the current implementation, including queries reaching the 100-candidate bound. Record extra indexed reads, scanned text, and measurement count/cost.

Establish release budgets for usefulness, density, and performance from these baselines before enabling promotion. Recording metrics alone does not satisfy the release checks.

### Follow-up evaluation

Broader studies of type-to-first-useful-result and time to successful activation, p50/p95 reporting across workloads, and exhaustive allocation profiling can follow. Investigate allocation or retained-memory regressions before release if representative runs expose them. These studies do not require a new benchmark or telemetry framework to ship the feature.

## Accepted limits

These limits are intentional scope decisions, with explicit reasons to revisit them:

| Accepted limit                                                                                                                                 | Reason and evidence needed to revisit                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid matches touching uncertain slice/chunk edges can remain unpromoted, including a short message whose only matching token touches an edge. | Source boundaries are unknown. Measure lost useful promotions; add provenance only if the loss warrants the contract/storage cost and the host can actually substantiate it.        |
| Complete conversation evidence spread across messages, outside the selected 512-code-point excerpt, or too wide for one line cannot promote.   | Promotion is explained by one visible fragment. A broader evidence policy requires a separately reviewed presentation/product decision, supported by judged missed-result examples. |
| Older hosts and unproven snippets retain best-effort results without promotion.                                                                | Additive compatibility is preferable to guessing provenance. A missing promotion is distinct from dropping a destination or certifying false proof.                                 |
| After interaction, a late best hit may enter the unseen suffix instead of the first screen.                                                    | Observed target geometry takes precedence. Measure early-navigation activation and discovery; full reranking above protected targets would change the interaction contract.         |
| Eligible rows reserve space even for an empty or failed request.                                                                               | This prevents late growth. Density and first-screen usefulness must pass the baseline budgets; remote/ineligible rows should never pay this cost.                                   |

The named PRs must implement and verify these contracts and satisfy the [release checks](#required-before-enabling-promotion). Accepted limits can be revisited with correctness counterexamples, judged missed results, failed budgets, or a simpler implementation preserving the same behavior.

## Acceptance tests

Extend existing host evidence, ranking, merge, section, and interaction suites. The contracts are defined in [original excerpts](#original-excerpt-contract-prerequisite), [ranking](#ranking-policy), [literal classification](#literal-classification-and-merge), [excerpt geometry](#excerpt-geometry-and-measurement), and [prefix reconciliation](#committed-observed-prefix-and-caps); the table below maps them to regression fixtures.

| Scenario                                                                      | Required result                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destinations/names/prefixes/exact supporting evidence compete with transcript | Protected ordinary results lead, with existing destination and workspace/settings safeguards.                                                                                                                    |
| Strong transcript versus weak ordinary                                        | Transcript leads within Open Tabs; section leadership uses consistent effective strength while retaining stronger ordinary distinctions.                                                                         |
| Both ordinary entity sorts                                                    | Explicit fixtures explain cross-band reversals; within-band comparator and generic consumers remain intact. Same order with absent/disabled/error/legacy-host transcripts.                                       |
| Comparator laws and ordering                                                  | Antisymmetry, transitivity, deterministic ties, and original ordinals survive filtering/merging.                                                                                                                 |
| Several hits map to one tab                                                   | Classify and fit before deduplication; complete displayable proof wins, then ordinal. One row retains stronger ordinary/transcript signal and name highlights.                                                   |
| Compact proof in a long message                                               | Actual host-produced original text successfully promotes even when the unchanged legacy snippet contains generated ellipses.                                                                                     |
| Repeated common anchors                                                       | Context/window selection finds compact complete proof instead of stopping at the first common word.                                                                                                              |
| Original identifiers and shadow-only retrieval                                | Real components can qualify when original text is extractable. Synthetic joined shadow phrases never qualify.                                                                                                    |
| Incomplete, substring, or typo evidence                                       | `car started` cannot prove `car art`; refresh-only cannot prove `token refresh race`. Typo routes can promote original literal text, never repaired-only proof.                                                  |
| Quotes/operators/query caps                                                   | All original free-text tokens, including stop words/backend-omitted terms, are required. Phrases cannot skip punctuation or cross omitted spans, columns, messages, or sessions. Operator-only never promotes.   |
| Markers and literal source punctuation                                        | Legacy marker parsing never certifies; marker-free original text can qualify. Literal brackets/ellipses stay source text; missing/invalid original evidence cannot promote.                                      |
| Slice/chunk edges and Unicode                                                 | Unknown boundaries cannot certify. Cover clipped identifiers, surrogate pairs, NFC/combining characters, 512-code-point bound, and half-open UTF-16 offsets.                                                     |
| Extraction lifetime and compatibility                                         | Retention, source retirement, and generation changes cannot bypass current joins/checks; no transcript file reads. Older hosts/clients preserve legacy behavior.                                                 |
| Width, badges, scrollbar, and font                                            | Verify actual highlighted fit before caps, including unmounted candidates. Unknown/narrow width cannot promote. Membership/badges do not alter width; explicit display changes invalidate without a rerank loop. |
| Eligible geometry                                                             | Only locally eligible rows reserve a line from first render, retained through empty/error responses; filling/changing/clearing excerpts cannot grow rows.                                                        |
| Stale generations and visibility                                              | Raw query/filter/policy invalidation precedes deferred completion; old responses/snapshots cannot leak across generations or visibility resets.                                                                  |
| Arrival before interaction                                                    | Ranking and default selection commit together under destination/Create rules.                                                                                                                                    |
| Arrival after keyboard/hover/scroll                                           | Capture the previous committed prefix before replacement; selected/hovered rectangles, pointer target, scroll, and Enter destination remain stable.                                                              |
| 50 capped rows plus 20 stronger arrivals                                      | Protect observed prefix while strong hits replace unseen suffix. Cover immediate Down after typing, repeated batches, genuine removal, and unique overflow counts.                                               |
| Split sections, headings, hints, See more                                     | Preserve protected layout despite leadership changes; per-section capacity, continuation membership, explicit expansion, and unique counts remain correct.                                                       |
| Hover versus Create                                                           | Hover/scroll protection does not authorize Create; programmatic callbacks do not pin. Preserve Create's explicit-gesture/task-URL rules.                                                                         |
| Removed/colliding destinations                                                | No stale activation or local evidence on remote rows. Cover focused runtimes, live/sleeping panes, folder workspaces, and surviving-neighbor selection.                                                          |

Rendered tests record selected/hovered `getBoundingClientRect()`, scroll, and a parked pointer's hit-test before late arrivals, then assert the same targets and Enter activation afterward. Cover unenriched rows above the target, caps, split headings, and leadership changes; exercise keyboard and hover separately. Identity/`scrollTop` assertions alone are insufficient.

For implementation, run focused suites with `ORCA_BACKGROUND_LAUNCH=1`, appropriate host/renderer typechecks, changed-code quality checks, and `git diff --check`. Use the project's Electron skill and Playwright CDP with hidden, unfocused renderers. Do not use computer-use, reveal windows, or run native-focus tests on the user's desktop; rebuild modified launch-policy code before launch. These are implementation gates, not a reason to launch the app for this doc edit. The retrieval PR adds eligibility-before-route/folding/cutoff regressions.

## Alternatives considered

**Always append transcript results.** Useful content stays buried below weak names and cannot affect section leadership.

**Infer provenance from legacy snippets.** Markers, clipping, ellipses, and identifier shadows cannot establish original adjacency. One bounded original-text field fixes the trust boundary.

**Add host scores, match ranges, or boundary metadata now.** Interior literal proof needs only original text. Richer metadata adds a second matching policy or migration beyond this scope.

**Full quality-first ordering or score blending.** Two ordinary bands preserve existing comparisons and expose the necessary reversals for review without a broader ranking rewrite.

**Partial promotion or a separate transcript section.** One common word can displace a complete ordinary match; a second section duplicates destinations. Use one complete-proof tier and one row.

**Rank from original text without checking visible fit.** This removes measurement but can promote a row whose displayed preview hides required terms. It changes the [visible-proof requirement](#literal-classification-and-merge).

**Freeze membership or every capped row after interaction.** See the [early-navigation rationale](#design-rationale) and [prefix/cap contract](#committed-observed-prefix-and-caps). Either shortcut suppresses useful late arrivals.

**Freeze IDs/scroll or measure after ranking.** Geometry still moves pointer targets, and mounted-only checks miss capped candidates. Reserve eligible row space and measure shared-width windows before ranking.

**Raise the page limit or keep paging.** Extra history cannot undo route/folding suppression. Apply eligibility before those host decisions in the separate PR.

## Implementation validation

Reference: 2026-10-19, macOS arm64, hidden Electron renderers, default Geist typography, 900px palette and 600px list. This is a fixed synthetic evaluation, not a production study. Host recall remains the separate change described in the design.

### Release budgets

Promotion requires literal original-source proof and a measured highlighted window. Missing provenance, unknown typography/width, and failed fit checks retain ordinary or unpromoted index results.

| Check                                        | Budget                                                                                         | Reference result                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Literal false promotions                     | Zero across the corpus and boundary regressions                                                | Zero                                                 |
| Useful destination on the first screen       | No exact-navigation loss; at least three additional successful queries in the nine-case corpus | 2/9 → 6/9; exact title stays first                   |
| Useful late arrivals after early interaction | All 20 arrivals enter the unseen suffix with the original 50-row capacity                      | 20/20 for keyboard, hover, and scroll                |
| Excerpt reservation density                  | At most four visible rows lost at the reference viewport                                       | 11 → 9, two lost                                     |
| Host median, 100 long-message hits           | At most twice the baseline median plus 2ms                                                     | 9.54ms → 15.17ms                                     |
| Extra indexed reads                          | At most one bounded row read per returned hit                                                  | 100 reads; 723,700 source code points in the fixture |
| Returned original content                    | At most 100 × 512 Unicode code points                                                          | 51,200 code points                                   |
| Fit reads                                    | At most 100 × 8 windows, in one out-of-flow batch                                              | 100 unique reads after caching                       |
| Fit-read CPU                                 | At most 16ms on the reference machine                                                          | 0.10ms                                               |
| Renderer arrival work                        | At most 100ms on the reference machine                                                         | 85.31ms isolated                                     |

The renderer work measurement uses CDP thread task counters through the DOM commit. It includes application work during that interval and excludes accessibility assertions. The ordinary-input interval in the same 200-tab fixture recorded 6,812ms of renderer task time; it includes input and application activity and is not a general matcher-latency baseline. No renderer speedup is claimed. Isolated arrival runs recorded 85.31ms and 97.63ms; the full eight-case run recorded 107.25ms. The isolated gate passes, but the full-suite overrun shows limited margin and should be rechecked when changing classification or measurement.

Timing assertions run with `ORCA_CMD_J_EVALUATION=1` on an otherwise idle reference machine. Ordinary test runs enforce deterministic work, density, proof, and interaction bounds without imposing machine-specific latency thresholds on other platforms.

### Judged corpus

Usefulness labels are separate from literal completeness. For example, the first broad-word hit is an incidental build-log mention: it can prove the word without being the useful conversation. Each query has the same bounded candidate population before and after; weak-name cases include fourteen ordinary distractors. All newly visible useful destinations rank first or second, so the gain does not depend on a partially visible final row.

| Query shape                                         | Useful rank before | Useful rank after |
| --------------------------------------------------- | -----------------: | ----------------: |
| Exact title navigation                              |                  1 |                 1 |
| Distinctive `token refresh race` terms              |                 15 |                 1 |
| Broad `refresh`, with an incidental earlier hit     |                 16 |                 2 |
| Original `tokenRefresh` identifier                  |                 15 |                 1 |
| Typo retrieval with repaired-only source text       |                 15 |                15 |
| Compact proof inside a long message                 |                 15 |                 1 |
| Quoted phrase competing with identifier-shadow text |                  2 |                 1 |
| Useful text touching an uncertain chunk edge        |                 15 |                15 |
| Useful session omitted by host retrieval            |            Missing |           Missing |

The final three misses distinguish renderer policy from retrieval recall: repaired-only text and uncertain edges cannot promote; an omitted host candidate cannot be recovered by renderer ranking.

### Compatibility and ordinary ordering

The optional `originalExcerpt` field is validated and projected by the existing service and transport paths. Legacy snippets remain unchanged. Invalid optional evidence is discarded without dropping its result. Older hosts cannot certify promotion. Local evidence cannot attach to a runtime-owned workspace or an explicitly remote tab, including when a runtime is focused.

The Cmd+J adapter owns both entity sorts. The generic comparator retains its implementation. Ordinary before/after fixtures record the intended reversal: protected fallback exact evidence moves ahead of structured weak or fuzzy evidence. Comparisons inside each ordinary band retain semantic, activity, position, and identity ordering. Section leadership retains its stronger ordinary distinctions and workspace/settings destination safeguard.

### Validation coverage

The final focused run passed 649 tests across 56 suites. All eight hidden Electron cases, host and renderer typechecks, the changed-code quality gate, and `git diff --check` passed. The isolated host and renderer budget gates also passed.

The unit suites cover extraction lifetime, retention, generation rejection, public and transport compatibility, NFC/UTF-16 ranges, clipped combining marks and identifiers, original-query caps and stop words, quotes and punctuation, repeated anchors, fit-before-tab deduplication, separate ordinary/transcript signals, comparator laws, section leadership, observed-prefix reconciliation, continuation headings, unique overflow, removal, and programmatic callbacks.

Hidden Electron tests record row rectangles, viewport height, scroll position, and a parked pointer's hit target before late arrivals. They assert the same targets and selected value afterwards, then verify Enter activates the selected tab. Separate cases verify initial default selection, shared excerpt widths, narrow-to-wide resize, the 100-candidate bound, and website navigation in both themes. All launched windows remain hidden.

Run the isolated budgets after the regular focused suites:

```bash
ORCA_BACKGROUND_LAUNCH=1 ORCA_CMD_J_EVALUATION=1 pnpm test src/main/ai-vault-search/session-search-original-excerpt-performance.test.ts --silent=false --reporter=verbose
ORCA_BACKGROUND_LAUNCH=1 ORCA_CMD_J_EVALUATION=1 SKIP_BUILD=1 pnpm run test:e2e tests/e2e/worktree-jump-palette-transcript-ranking.spec.ts --workers=1 --grep budgets
```

`SKIP_BUILD=1` requires a current `electron-vite build --mode e2e`. With an active dev watcher, use `--outDir <app>/out` and set `ORCA_E2E_BUILD_DIR=<app>/out`. That isolated app needs its own copy of `package.json`, plus `resources`, `node_modules`, and `out/cli` (the reference bundle linked those to the worktree). The harness checks the package and entry before launching Electron. The repository's background-only Playwright harness was used because the referenced Electron skill was unavailable. Screenshot evidence is retained locally under `.tmp/cmd-j-transcript-search/`.

The implementation preserves the accepted conservative misses, local-only scope, 120ms debounce, 100-hit bound, consent, cancellation, and existing activation authority. Wider recall, remote expansion, production p50/p95 studies, and richer message-boundary provenance remain follow-ups.

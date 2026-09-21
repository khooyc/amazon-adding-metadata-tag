# Browser edition: organic discovery and launch plan

Prepared 14 September 2026. This is a private local proposal, not a publication or a promise of rankings. The desktop-download change is implemented; the growth work below is proposed. The public production URL and tutorial URL have not been supplied, so live indexing, rankings, traffic, host headers, and backlinks have not been audited.

## Positioning

Lead with a specific outcome: help Amazon sellers add and inspect the `contains-synthetic-performer` keyword in their listing media. The best initial audience is sellers and agencies creating media with photorealistic AI-generated people. Product photographers, A+ content designers, and seller educators are useful adjacent audiences because they repeat this workflow for clients.

Amazon's announcement specifies this keyword in XMP `dc:subject` and limits the requirement to media containing photorealistic AI-generated people, with listed exceptions. Explain those exceptions and link to the official announcement. Avoid suggesting every AI-edited image needs the tag, or that local verification means Amazon has accepted a file. [Amazon announcement](https://sellercentral.amazon.com/seller-forums/discussions/t/aa0aee06-aff4-497a-a4b6-9b2ebe06f715).

Use one consistent product name, publisher identity, domain, and visual identity across the browser tool, desktop releases, tutorial, and help pages. Explain that the product is independent of Amazon. A credible, specific utility is a stronger starting point than a general claim to be an all-purpose seller platform.

## Findings from the local site

| Finding | Implication | Proposed work |
| --- | --- | --- |
| The tool and introductory copy are in static HTML. | Good starting point: basic content is readable without interacting with the uploader. | Keep useful guidance in HTML and keep the tool immediately accessible. |
| The current title is "Amazon Metadata Tag — Web" and the heading is generic. | They under-explain the seller problem, exact tag, and free browser workflow. | Use a descriptive title and opening explanation; draft below. |
| There is no canonical URL, sitemap, robots file, social-preview metadata, or structured data in the web source. | These need deliberate setup around the chosen public domain. Their absence alone does not prove indexing is blocked. | Add the appropriate discovery metadata and validate the production responses. |
| There is no public tutorial, browser/desktop comparison, substantial FAQ, or documented output example in the browser pages. | Visitors have little evidence to decide whether the tool fits their media or to cite it accurately. | Build a small set of useful, linked guides and demonstrations. |
| The browser loads a roughly 1.58 MB detector script and the service worker pre-caches models, including a roughly 4.65 MB body model. These are uncompressed local file sizes. | First visits can do unnecessary work when someone only wants the guide or video workflow. Actual network transfer and speed are unmeasured. | Measure loading and defer detection libraries/models until requested; keep optional offline support understandable. |
| The video path currently marks 95% played as a full watch and recreates all gallery players on renders. | Watch wording and progress preservation need attention before a polished tutorial records this flow. | Correct review behavior, preserve playback state, and test seek/pause/mixed-media cases. |
| The current video badge branch returns before showing file errors. | A tagging failure can lack a useful explanation on the affected video card. | Show actionable per-file errors and separate successful verification from successful saving. |
| Video metadata tests use small synthetic container fixtures. | Passing those tests does not establish that real MP4/MOV/M4V outputs play correctly or are read by an independent metadata tool. | Run a representative compatibility pass before broad promotional claims. |

Evidence: `web/index.html`, `web/app.mjs`, `web/service-worker.js`, `web/xmp.mjs`, `test/web-xmp.test.cjs`, and the generated local web assets. These are source observations, not results from a live production audit.

## Proposed homepage writing

Title: **Free Amazon AI Metadata Tag Tool | Browser & Desktop**

Main heading: **Add the Amazon AI disclosure tag to your listing media.**

Opening text:

> Add `contains-synthetic-performer` to selected images and supported videos, then inspect the metadata in your saved copy. Use the free browser tool with no account and local file processing, or download the desktop app for larger media libraries.

Primary action: **Choose images or videos**

Secondary action: **Download desktop app**

Suggested description:

> Add contains-synthetic-performer to supported Amazon listing media. Review files locally, check XMP metadata, and save copies. Free browser and desktop tools.

Only ship video capability wording after the compatibility pass confirms the supported formats and limitations. Show those limits beside the tool. Keep the exact keyword and field in explanatory text because users need to recognize them, not to repeat keywords for search engines. Do not promise a fixed search snippet; the search engine may rewrite it.

Below the tool, explain: who needs this, the three-step workflow, what is written, how to verify the saved file, browser versus desktop, supported formats, and common questions. Include a short publisher/about section, release history, and a privacy explanation. Provide actual evidence from safe demonstration files; never use private seller files as promotional examples without permission.

## A small content set with distinct purposes

These are proposed routes, not existing pages. Adapt them to the hosting setup once the domain is confirmed.

| Page | Visitor need | Original evidence to include |
| --- | --- | --- |
| `/` | Use the tool now. | Clear local-processing explanation and a successful saved-copy example. |
| `/guides/contains-synthetic-performer/` | Understand the tag and when it applies. | Official source, reviewed date, exact keyword and metadata field, exceptions. |
| `/guides/verify-xmp-tag/` | Check whether tagging worked. | Before/after metadata and an independent reader; distinguish local verification from Amazon acceptance. |
| `/tutorial/` | Watch the creator demonstrate the workflow. | The finished tutorial, corrected captions/transcript, chapters, and links to try the tool or download. |
| `/desktop/` | Choose browser or desktop and install correctly. | Accurate capability comparison, OS choices, current release links, and known installation issues. |

Cover PNG/JPEG differences, video limitations, privacy, and common errors within these pages first. Create a separate page only when the question warrants its own complete answer. Avoid near-identical pages for every keyword variation.

Initial search themes to validate, not measured search-volume claims: "contains-synthetic-performer", "how to add contains-synthetic-performer", "Amazon AI image metadata tag", "verify XMP dc subject", and "Amazon AI video metadata". Use Search Console queries and questions from real viewers to refine the content after launch.

## Search and AI access

Settle on one stable HTTPS domain before recording the spoken address or publishing links. Make public pages return successful responses, allow intended crawlers through the host's firewall, establish canonical URLs, publish a sitemap, and validate indexing in Google Search Console and Bing Webmaster Tools. A localhost preview cannot be indexed by public search engines.

Google's AI guidance emphasizes useful original content and ordinary search foundations. Indexing, snippet eligibility, and the site's Search Console inclusion setting matter; none guarantees display. It says special AI files such as `llms.txt` and special schema are unnecessary for Google. [Google AI optimization guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).

For ChatGPT search, review `OAI-SearchBot` access and published crawler IP ranges. This is separate from `GPTBot`, which concerns potential training use. Search access does not require consenting to training, and creating a custom chatbot does not cause general AI assistants to recommend the tool. [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots).

Add accurate application and publisher structured data only where it matches visible facts. Add `VideoObject` once the tutorial has a real title, publication date, thumbnail, and playable URL. Markup can describe content and support eligible search features; it is not a ranking guarantee. Do not invent ratings, downloads, testimonials, or Amazon endorsement to complete schema fields. See the companion [public-source evidence](research/search-discovery-evidence.md).

## Use the tutorial as the launch asset

Suggested title: **How to Add contains-synthetic-performer to Amazon Images | Free Browser & Desktop Tool**

Use a video-specific title if the finished recording primarily demonstrates video. Lead with the outcome in the first 20–30 seconds, then explain who actually needs the tag. Show the full path: choose media, review, tag, save, and inspect the output. Demonstrate browser first for an easy trial; follow with the desktop workflow and explain when it fits larger libraries.

Plan chapters around the actual recording: when tagging applies, browser walkthrough, output verification, desktop walkthrough, video limitations, and common mistakes. Correct captions and write a readable transcript; do not publish invented chapter timestamps before the edit is final.

Put the canonical tool link near the top of the YouTube description and a clear link in a pinned comment. Say and display the same domain in the video. Use a thumbnail that communicates the specific problem and the tool, without a claim of Amazon endorsement. Publish the tutorial on its own watch page with the video prominent, a stable thumbnail, and supporting text. Google recommends dedicated watch pages and readable video metadata for video discovery. [Google video guidance](https://developers.google.com/search/docs/appearance/video).

After the main tutorial, derive a few useful clips: the exact field to edit, how to verify a saved tag, and choosing browser versus desktop. Each should solve a small problem and direct viewers to the complete guide. Avoid treating clip quantity as a substitute for a clear demonstration.

## Earn recognition through real use

Proposed initial effort: recruit a small pilot of roughly 5–10 sellers or listing designers, observe where they get stuck, and fix the repeated problems. This is an activity target, not a usage forecast. Later, approach a small, relevant group of seller educators and agencies with an actual demonstration and a request for honest feedback.

Answer existing questions in seller communities where relevant links and creator participation are permitted. State that you built the tool. Prioritize a helpful answer even when a link is not appropriate. Do not buy links, fabricate independent recommendations, automate promotional replies, or manufacture testimonials. Reviews and case studies should come from actual users and be published only with their permission.

Keep the publisher identity, product name, website link, and capability claims consistent across approved public listings. Genuine tutorials, agency workflow references, and helpful community discussions can introduce the tool to new users; their effect on ranking is uncertain.

## Proposed rollout and measurement

| Timing | Deliverable | Evidence of progress |
| --- | --- | --- |
| Before recording the final tutorial | Correct video review behavior, test real outputs, stabilize browser/desktop wording and installer flow. | Pilot users can complete their task; outputs pass independent inspection. |
| Week 1 | Homepage copy, core guide, verification guide, domain metadata, performance pass. | Public pages are crawlable and the first-use flow is clear. |
| Week 2 / video launch | Tutorial watch page, finished video assets, captions/transcript, clear product links. | Working video-to-tool journey and correctly presented tutorial metadata. |
| Weeks 3–4 | Small pilot feedback round, approved educator/community distribution, targeted fixes. | Repeated problems resolved; real users describe successful workflows. |
| Months 2–3 | Improve pages from observed queries and support questions; consider reviewed translations where demand appears. | Relevant search impressions/clicks and useful referrals improve against the first month's baseline. |

Start with search-platform and YouTube reports and an owner-controlled record of pilot feedback. Track relevant query impressions, click-through rate by page/query, tutorial retention and outbound visits where available, browser/desktop interest, and task success. Inspect AI referrals when identifiable, but expect attribution gaps; a few manual prompts are not a reliable measure of AI recommendation frequency.

The browser currently sends no usage analytics. Measuring file selection, successful output saves, errors, or repeat usage would require a separate explicitly approved measurement design. Do not silently add tracking to a tool advertised as private. If approved later, use minimal aggregate events and exclude filenames, media, metadata contents, and seller identifiers. A GitHub download count is not a count of unique installs or active users.

Use the first month to establish a baseline. Do not invent traffic targets or promise that a site becomes well known within 30/60/90 days. The first commercial outcome to optimize is a visitor successfully preparing a file; awareness has little value if the task fails.

## Scope and next implementation inputs

Completed now: the browser's install action opens Windows, Apple-silicon Mac, and Intel Mac desktop download choices. All three current public installer URLs returned HTTP 200; opening and closing the dialog was checked in the local browser. This does not validate installing or launching every operating-system package.

Outstanding inputs for the proposed growth work: the production domain, finished tutorial URL and publication details, and the public publisher identity to use consistently. Publishing, search-platform submissions, third-party tracking, and contacting communities are future actions, not actions performed in this analysis. All new source changes and this plan remain on the local device.

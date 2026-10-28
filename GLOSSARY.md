# Kami

A calm personal reading library: saved articles, feeds, shelves, journal and trips for a single reader.

## Language

### Reading

**Article**:
A piece of writing the reader saved to their library, owned by exactly one user.
_Avoid_: Item, post, link (when the clean text exists)

**Gist**:
The AI summary of an article: a TL;DR, a handful of key points and a suggested folder.
_Avoid_: Summary card, AI summary, digest (digest means the feed write-up)

**Tidy**:
Removing clutter blocks (ads, sponsor slots, subscribe prompts, footers) from an article's saved copy without rewriting any of its text; happens automatically after a single save.
_Avoid_: Clean, clean-up (in code), sanitize (that's the HTML safety pass)

**Original copy**:
An article's body as captured, before Tidy, kept so the reader can restore it.
_Avoid_: Raw HTML, backup

### Listening

**Narration**:
The spoken audio of an article's full text, made only when its owner asks for it and private to them.
_Avoid_: Audio, TTS, podcast, read-aloud (read-aloud was the old browser voice)

**Narration part**:
One stretch of an article's text spoken in a single Deepgram call; a narration is built from its parts in order.
_Avoid_: Chunk, segment

**Narration allowance**:
How many characters a user may still have narrated, granted by the operator; every user starts at zero.
_Avoid_: Credits, quota, balance (on its own)

**Reservation**:
The part of a narration allowance set aside for a narration that has started but not finished; it becomes a spend as parts finish, or returns when the narration is deleted.
_Avoid_: Hold, lock

**Deepgram balance**:
The money left in the operator's Deepgram account, which pays for every narration regardless of who asked for it. Never shown in the app.
_Avoid_: Credits, remaining credit

### Trips

**Trip**:
A private plan for one journey to a destination, made of a hotel shortlist and a day-by-day itinerary. Stands alone: it never refers to saved articles.
_Avoid_: Journey, vacation, itinerary (the itinerary is only one part of a trip)

**Trip status**:
Where a trip stands, set by hand by its owner: planning, booked, done or archived. Never changes on its own and is separate from the trip's dates.
_Avoid_: Stage, state, phase

**Trip agent**:
The optional planning helper chatted with on a trip's board; it plans hotels and days but never sets a trip's status. Available only when AI is configured.
_Avoid_: Trip assistant, chatbot, copilot

### Research

**Topic**:
A private research workspace for one space or audience, holding its runs, sources, evidence, ideas, reports and players. Stands alone: it never draws on saved articles, feeds or highlights.
_Avoid_: Project, space (as a noun), folder

**Seed**:
The words a Discover run starts from: a space, an audience or a problem area.
_Avoid_: Prompt, keyword

**Plan**:
The list of search queries a run will make, drafted by the model and editable before the run spends anything.
_Avoid_: Strategy, query set

**Depth**:
Quick or Deep: sets a run's budget, how many results it searches and how many pages it reads.
_Avoid_: Mode, level

**Run**:
One execution of Discover, Validate, a question or Explore inside a topic, with its own plan, budget, progress and cost.
_Avoid_: Job, task, session

**Source**:
A stored copy of one web page, reused across the user's runs and topics while it is fresh.
_Avoid_: Document, page (on its own), link

**Evidence**:
One exact quote from a source, checked in code against the page, with its kind, sentiment and flags. The only thing a claim may cite.
_Avoid_: Snippet, excerpt, data point

**Idea**:
A product opportunity in a topic: a named group of pain, request and workaround evidence, with a computed idea score. Builds up across runs.
_Avoid_: Opportunity, cluster, insight

**Idea score**:
An idea's sub-scores (frequency, spread, intensity, willingness to pay, recency) and their weighted total, computed in code from its evidence, plus a competition label. Never made up by a model.
_Avoid_: Rating, rank, AI score

**Report**:
A cited write-up a run produces: a Validate report or the answer to a question. A claim with no evidence is shown as unsupported.
_Avoid_: Summary, answer (on its own)

**Player**:
A product or company in a topic's space, with its positioning, pricing and the complaints evidence holds about it.
_Avoid_: Competitor (it may be a partner), company, tool

**Research credit**:
The unit research is metered in: one Firecrawl credit, with model tokens converted at a set rate. Granted by the operator; every user starts at zero.
_Avoid_: Credits (on its own), tokens, quota

### People

**Operator**:
The person who runs this Kami deployment and pays its third-party bills; grants narration allowance and research credits.
_Avoid_: Admin, owner

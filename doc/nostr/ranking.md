# Ranking Algorithm

Your inputs:

* many users
* partial ratings
* different priorities

Your output:

> “Best place *for this user right now*”

---

## Step 1: Normalize scores

Convert 1–10 → 0–1:

```text
normalized_score = (score - 1) / 9
```

Why:

* easier math
* comparable across aspects

---

## Step 2: Per-aspect aggregation (avoid averages trap)

Instead of mean, compute:

### A. Positive ratio

```text
positive = score >= 7
negative = score <= 4
```

Then:

```text
positive_ratio = positive_votes / total_votes
```

---

### B. Confidence-weighted score

Use something like a **Wilson score interval** (this is key):

* prevents small-sample abuse
* avoids “1 review = #1 place”

---

## Step 3: Build aspect scores

For each aspect:

```text
aspect_score = f(
  positive_ratio,
  confidence,
  number_of_reviews
)
```

You can approximate with:

```text
aspect_score = positive_ratio * log(1 + review_count)
```

(Simple, works surprisingly well)

---

## Step 4: User preference weighting

User defines:

```json
{
  "quality": 0.5,
  "value": 0.2,
  "service": 0.2,
  "speed": 0.1
}
```

Then:

```text
final_score = Σ (aspect_score × weight)
```

---

## Step 5: Context filtering (this is your unfair advantage)

Filter reviews before scoring:

* time-based:

  * “last 6 months”
* context-based:

  * lunch vs dinner
  * solo vs group

This is something centralized platforms barely do.

---

## Step 6: Reviewer weighting (later, but powerful)

Weight reviews by:

* consistency
* similarity to user preferences
* past agreement

This gives you:

> “people like you liked this”

---

# 3. Example end-to-end

### Raw reviews:

| User | Food | Service |
| ---- | ---- | ------- |
| A    | 9    | 4       |
| B    | 8    | 5       |
| C    | 10   | 3       |

---

### Derived:

* food → high positive ratio (~100%)
* service → low (~33%)

---

### User preferences:

```json
{
  "food": 0.8,
  "service": 0.2
}
```

→ ranks high

Another user:

```json
{
  "food": 0.3,
  "service": 0.7
}
```

→ ranks low

👉 Same data, different truth
That’s your killer feature.

---

# 4. Critical design choices (don’t skip these)

## A. No global score in protocol

Let clients compute it.

---

## B. Embrace incomplete data

Most reviews will have:

* 1–3 aspects only

That’s fine.

---

## C. Time decay (important)

Recent reviews should matter more:

```text
weight = e^(-λ × age)
```

---

## D. Anti-gaming baseline

Even in nostr:

* spam will happen

Mitigation later:

* require minimum interactions
* reputation layers

---

# 5. What you’ve built (zooming out)

This is not a review system.

It’s:

> A decentralized, multi-dimensional reputation graph for real-world places

That’s much bigger.

---

# 6. Next step (if you want to go deeper)

We can design:

### A. Query layer

* how clients fetch & merge nostr reviews efficiently

### B. Anti-spam / trust model

* web-of-trust
* staking / reputation

### C. OSM integration details

* handling duplicates
* POI identity conflicts

---

If I had to pick one next:
👉 **trust/reputation system** — because without it, everything you built *will* get gamed.

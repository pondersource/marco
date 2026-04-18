# Canonical Aspect Vocabulary (v0.1)

## A. Core universal aspects

These should work for _any_ place:

```json
[
  "quality", // core offering (food, repair, exhibits, etc.)
  "value", // value for money/time
  "experience", // comfort, usability, vibe
  "accessibility" // ease of access, inclusivity
]
```

### Why these work

- **quality** → your “product” abstraction (critical)
- **value** → universally meaningful signal
- **experience** → captures everything “soft”
- **accessibility** → often ignored but high utility

👉 Resist adding more. Every extra “universal” weakens the concept.

---

## B. Common cross-domain aspects (recommended pool)

Not universal, but widely reusable:

```json
[
  "service", // human interaction
  "speed", // waiting time / turnaround
  "cleanliness",
  "safety",
  "reliability",
  "atmosphere"
]
```

These apply to:

- restaurants, garages, clinics, parks, etc.

---

## C. Domain-specific examples (NOT standardized)

Let clients define freely:

```json
{
  "restaurant": ["food", "drinks"],
  "bar": ["drinks", "music"],
  "garage": ["work_quality", "honesty"],
  "park": ["greenery", "amenities"],
  "museum": ["exhibits", "crowding"]
}
```

---

## D. Key rule (this prevents chaos)

👉 **Aspect keys MUST be lowercase snake_case**

👉 **Meaning is defined socially, not technically**

To reduce fragmentation:

- publish a **public registry (GitHub repo)**
- clients can:
  - suggest additions
  - map synonyms

---

## E. Optional normalization hint (important later)

Allow this:

```json
"aspect_aliases": {
  "food": "quality",
  "work_quality": "quality"
}
```

Not required, but useful for aggregation engines.

---

## Notes

Map familiarity in UI to:

- high: “I know this place well”
- medium: “Been a few times”
- low: “First visit”

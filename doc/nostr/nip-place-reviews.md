# NIP-XX: Place Reviews

`draft` `optional`

## Abstract

This NIP defines a standardized event format for decentralized place reviews using Nostr. Reviews are tied to real-world locations (e.g. OpenStreetMap POIs) via tags, and include structured, multi-aspect ratings, a binary recommendation signal, and optional contextual metadata.

The design prioritizes:

* Small event size
* Interoperability across clients
* Flexibility for different place types
* Efficient geospatial querying using geohashes

## Event Kind

`kind: 30360`

## Tags

Additional tags MAY be included by clients but are not defined by this specification.

This NIP reuses and builds upon existing Nostr tag conventions:

* `i` tag: see NIP-73 (External Content Identifiers)
* `g` tag: geohash-based geotagging (community conventions)

Where conflicts arise, this NIP specifies the behavior for review events.

### Required

#### `i` — Entity Identifier

Identifies the reviewed place using an external identifier. OpenStreetMap data is the default:

```
["i", "osm:<type>:<id>"]
```

Requirements:

* For OSM POIs, `<type>` MUST be one of: `node`, `way`, `relation`

Examples:

```
["i", "osm:node:123456"]
["i", "osm:way:987654"]
```

### Geospatial Tags

#### `g` — Geohash

Geohash tags are used for spatial indexing and discovery.

##### Requirements

* Clients MUST include at least one high-precision geohash (length ≥ 9)

##### Recommendations

Clients SHOULD include geohashes at the following resolutions:

* length 4 — coarse (city-scale discovery)
* length 6 — medium (default query level, ~1 km)
* length 7 — fine (neighborhood, ~150 m)

Example:

```
["g", "thrr"]
["g", "thrrn5"]
["g", "thrrn5k"]
["g", "thrrn5kxyz"]
```

##### Querying

Geospatial queries are performed using the `g` tag.

* Clients SHOULD query using a single geohash precision level per request
* Clients MAY include multiple geohash values in a filter to cover a bounding box
* Clients SHOULD limit the number of geohash values per query (e.g. ≤ 30)
* Clients MAY reduce precision or split queries when necessary

Note: Other queries (e.g. fetching reviews for a specific place) are performed using the `i` tag and are outside the scope of geospatial querying.

## Content (JSON)

The event `content` MUST be valid JSON matching the following schema.

### Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["version", "ratings"],
  "additionalProperties": false,
  "properties": {
    "version": {
      "type": "integer",
      "const": 1
    },
    "ratings": {
      "type": "object",
      "required": ["quality"],
      "additionalProperties": false,
      "properties": {
        "quality": { "$ref": "#/$defs/score" },
        "value": { "$ref": "#/$defs/score" },
        "experience": { "$ref": "#/$defs/score" },
        "accessibility": { "$ref": "#/$defs/score" },
        "aspects": {
          "type": "object",
          "minProperties": 1,
          "maxProperties": 20,
          "additionalProperties": { "$ref": "#/$defs/score" },
          "propertyNames": {
            "pattern": "^[a-z][a-z0-9_]{1,31}$"
          }
        }
      }
    },
    "recommend": {
      "type": "boolean"
    },
    "familiarity": {
      "type": "string",
      "enum": ["low", "medium", "high"],
      "description": "User familiarity: low = first visit; medium = occasional; high = frequent"
    },
    "context": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "visited_at": {
          "type": "integer",
          "minimum": 0
        },
        "duration_minutes": {
          "type": "integer",
          "minimum": 0,
          "maximum": 1440
        },
        "party_size": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        }
      }
    },
    "review": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "text": {
          "type": "string",
          "maxLength": 1000
        },
        "language": {
          "type": "string",
          "pattern": "^[a-z]{2}(-[A-Z]{2})?$"
        }
      }
    }
  },
  "$defs": {
    "score": {
      "type": "integer",
      "minimum": 1,
      "maximum": 10
    }
  }
}
```

## Example

### Restaurant Review Event

#### Tags

```
[
  ["i", "osm:node:123456"],
  ["g", "thrr"],
  ["g", "thrrn5"],
  ["g", "thrrn5k"],
  ["g", "thrrn5kxyz"]
]
```

#### Content

```json
{
  "version": 1,
  "ratings": {
    "quality": 9,
    "value": 8,
    "experience": 9,
    "accessibility": 7,
    "aspects": {
      "food": 9,
      "service": 6,
      "ambience": 8,
      "wait_time": 5
    }
  },
  "recommend": true,
  "familiarity": "medium",
  "context": {
    "visited_at": 1713200000,
    "duration_minutes": 90,
    "party_size": 2
  },
  "review": {
    "text": "Excellent food with bold flavors. Service was a bit slow, but the atmosphere made up for it.",
    "language": "en"
  }
}
```

## Semantics

### Ratings

* Scores are integers from 1 to 10
* `quality` is required and represents the core evaluation of the place
* Other fields are optional and context-dependent

### Aspects

* Free-form keys allow domain-specific ratings
* Clients MAY define and interpret aspect keys
* Clients SHOULD reuse commonly established aspect keys where possible

## Recommendation Signal

The `recommend` field represents a binary verdict:

* `true` → user recommends the place
* `false` → user does not recommend the place

Clients SHOULD strongly encourage users to provide this value.

## Familiarity

Represents user familiarity with the place:

* `low` → first visit or limited exposure
* `medium` → occasional visits
* `high` → frequent or expert-level familiarity

Clients MAY use this signal for weighting during aggregation.

## Context

Optional metadata about the visit.

* `visited_at` is a Unix timestamp
* `duration_minutes` represents time spent
* `party_size` indicates group size

## Interoperability

This specification defines a content payload only.

* In Nostr: place identity is conveyed via tags
* In other protocols (e.g. ActivityPub, AT Protocol): identity MUST be mapped to the equivalent field (e.g. `object`)

Content payloads SHOULD NOT include place identifiers.

## Rationale

### No Place Field in Content

Avoids duplication and inconsistency with tags.

### Multi-Aspect Ratings

Separates concerns (e.g. quality vs service), improving signal quality.

### Recommendation vs Score

Binary recommendation avoids averaging pitfalls and improves ranking.

### Familiarity

Provides a human-friendly proxy for confidence without requiring numeric input.

### Geohash Strategy

Multiple resolutions balance:

* efficient querying
* small event size
* early-stage discoverability

## Future Work

* Standardized aspect vocabularies
* Reputation and weighting models
* Indexing/aggregation services
* Cross-protocol mappings

## Security Considerations

* Clients SHOULD validate all input
* Malicious or spam reviews may require external moderation or reputation systems

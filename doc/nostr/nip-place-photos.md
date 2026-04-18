# NIP-XX: Place Photos and Media

`draft` `optional`

## Abstract

This NIP defines a standardized event format for sharing photos, videos, and other visual media tied to specific real-world locations (e.g., OpenStreetMap POIs).

While NIP-68 (Picture-first feeds) caters to general visual feeds, this NIP specifically targets map-based applications, travel logs, and location directories by mandating strict entity identifiers (`i` tags) and spatial indexing (`g` tags).

## Event Kind

`kind: 360`

## Content

The `.content` of the event SHOULD generally be empty. If a user wishes to provide a detailed description, summary, or caption for a place, clients SHOULD encourage them to create a Place Review event (`kind: 30360`) instead.

## Tags

This NIP relies on existing Nostr tag conventions to link media to places and provide inline metadata.

### Required Tags

#### 1. `i` — Entity Identifier

Identifies the exact place the media depicts using an external identifier (as defined in NIP-73). OpenStreetMap data is the default:

```json
["i", "osm:node:123456"]
```
* For OSM POIs, `<type>` MUST be one of: `node`, `way`, `relation`.

#### 2. `g` — Geohash

Used for spatial indexing and discovery. Events MUST include at least one high-precision geohash. To optimize for map-based discovery across different zoom levels, clients SHOULD include geohashes at multiple resolutions:

```json
["g", "thrr"]        // coarse (~city)
["g", "thrrn5"]      // medium (~1km)
["g", "thrrn5k"]     // fine (~150m)
["g", "thrrn5kxyz"]  // exact
```

#### 3. `imeta` — Inline Media Metadata

Media files MUST be attached using the `imeta` tag as defined in NIP-92. Each `imeta` tag represents one media item. The primary `url` SHOULD also be appended to the event's `.content` for backwards compatibility with clients that do not parse `imeta` tags.

Clients SHOULD include `alt` (accessibility descriptions), `dim` (dimensions), `m` (MIME type), and `blurhash` where possible.

```json
[
  "imeta",
  "url https://example.com/photo.jpg",
  "m image/jpeg",
  "dim 3024x4032",
  "alt A steaming bowl of ramen on a wooden table at the restaurant.",
  "blurhash eVF$^OI:${M{o#*0-nNFxakD-?xVM}WEWB%iNKxvR-oetmo#R-aen$"
]
```

### Optional Tags

* `t`: Hashtags for categorization (e.g., `["t", "food"]`, `["t", "architecture"]`).
* `content-warning`: If the media contains NSFW or sensitive imagery.
* `published_at`: Unix timestamp of when the photo was originally taken or published.

## Example Event

```json
{
  "id": "<32-bytes hex>",
  "pubkey": "<32-bytes hex>",
  "created_at": 1713205000,
  "kind": 360,
  "content": "",
  "tags": [
    ["i", "osm:node:987654321"],
    ["g", "xn0m"],
    ["g", "xn0m7h"],
    ["g", "xn0m7hwq"],

    ["imeta",
      "url https://example.com/ramen.jpg",
      "m image/jpeg",
      "dim 1080x1080",
      "alt A close-up of spicy miso ramen with chashu pork, soft boiled egg, and scallions.",
      "blurhash UHI=0o~q4T-o~q%MozM{x]t7RjRPt7oKkCWB"
    ],

    ["t", "ramen"],
    ["t", "food"]
  ]
}
```

## Rationale

### Why not use NIP-68 (Picture-first feeds)?

NIP-68 is designed for general-purpose social feeds (like Instagram). Place photos require strict guarantees about what entity is being depicted to be useful for map clients, directories, and review aggregators. By mandating the `i` tag for POI linking and the `g` tag for spatial querying, this kind ensures interoperability for geo-spatial applications without cluttering general picture feeds with mundane POI images (like photos of storefronts or menus).

### Separation from Place Reviews

Reviews (kind 30360) and media have different lifecycles and data models. A user might upload 10 photos of a park without writing a review, or write a detailed review without attaching photos. Keeping them as separate events allows clients to query `imeta` attachments for a specific `i` tag to quickly build a photo gallery for a place, regardless of whether a review was attached.

import Service, { service } from '@ember/service';
import { getLocalizedName, getPlaceType } from '../utils/osm';
import { getCategoryById } from '../utils/poi-categories';

export default class OsmService extends Service {
  @service settings;
  @service localForage;

  controller = null;
  cachedResults = null;
  lastQueryKey = null;
  cachedPlaces = new Map();

  // Long-term cache for OSM place metadata, persisted to IndexedDB (via the
  // `localForage` service) so that names and basic info survive across
  // sessions and can be rendered instantly without waiting on the OSM API.
  // Entries are refreshed in the background.
  static STORE_NAME = 'osm-cache';
  static CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  static IN_MEMORY_TTL_MS = 10000; // 10 seconds

  _buildCacheKey(osmType, osmId) {
    return `${osmType}:${osmId}`;
  }

  async _readLocalCache(osmType, osmId) {
    const key = this._buildCacheKey(osmType, osmId);
    try {
      const raw = await this.localForage.get(OsmService.STORE_NAME, key);
      if (!raw) return null;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (
        !parsed ||
        typeof parsed.timestamp !== 'number' ||
        Date.now() - parsed.timestamp > OsmService.CACHE_TTL_MS
      ) {
        await this.localForage.remove(OsmService.STORE_NAME, key);
        return null;
      }
      return parsed.data;
    } catch {
      try {
        await this.localForage.remove(OsmService.STORE_NAME, key);
      } catch {
        // ignore
      }
      return null;
    }
  }

  async _writeLocalCache(osmType, osmId, data) {
    if (!data) return;
    const key = this._buildCacheKey(osmType, osmId);
    try {
      await this.localForage.set(OsmService.STORE_NAME, key, {
        data,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.debug('[osm] Failed to write IndexedDB cache entry', e);
    }
  }

  /**
   * Async lookup for an OSM place. Checks the short-lived in-memory cache
   * first, then the persistent IndexedDB cache. Returns `null` if not
   * cached.
   *
   * Use this for instant rendering (e.g. place names in a list) and fall
   * back to `fetchOsmObject` for a fresh fetch + background refresh.
   *
   * @param {string} osmType 'node' | 'way' | 'relation'
   * @param {string} osmId
   * @returns {Promise<object|null>} Normalized OSM place data
   */
  async getCachedOsmObject(osmType, osmId) {
    if (!osmType || !osmId) return null;

    const cacheKey = this._buildCacheKey(osmType, osmId);
    const memoryEntry = this.cachedPlaces.get(cacheKey);
    if (
      memoryEntry &&
      Date.now() - memoryEntry.timestamp < OsmService.IN_MEMORY_TTL_MS
    ) {
      return memoryEntry.data;
    }

    return this._readLocalCache(osmType, osmId);
  }

  _storeInMemoryAndLocalStorage(cacheKey, osmType, osmId, data) {
    if (!data || !data.title) {
      console.debug(
        `[osm] Skipping cache write for ${cacheKey}: data has no title`
      );
      return;
    }

    this.cachedPlaces.set(cacheKey, { data, timestamp: Date.now() });

    // Auto-evict from the short-lived in-memory cache so it doesn't grow unbounded.
    setTimeout(() => {
      this.cachedPlaces.delete(cacheKey);
    }, OsmService.IN_MEMORY_TTL_MS);

    // Fire-and-forget the persistent write — the in-memory cache covers the
    // next immediate read, and the IndexedDB write happens in the background.
    void this._writeLocalCache(osmType, osmId, data);
  }

  cancelAll() {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  async getNearbyPois(lat, lon, radius = 50) {
    const queryKey = `${lat},${lon},${radius}`;

    // Return cached results if the query is identical to the last one
    if (this.lastQueryKey === queryKey && this.cachedResults) {
      console.debug('Returning cached Overpass results for:', queryKey);
      return this.cachedResults;
    }

    // Cancel previous request if it exists
    if (this.controller) {
      this.controller.abort();
    }
    this.controller = new AbortController();
    const signal = this.controller.signal;

    const typeKeys = [
      'amenity',
      'shop',
      'tourism',
      'historic',
      'leisure',
      'office',
      'craft',
      'building',
      'landuse',
      'public_transport',
      'aeroway',
    ];
    const typeKeysQuery = [`~"^(${typeKeys.join('|')})$"~".*"`];

    const negativeFilters = {
      public_transport: ['stop_area', 'platform'],
    };

    const negativeFiltersQuery = Object.entries(negativeFilters)
      .map(([key, values]) => {
        const valueRegex = `^(${values.join('|')})$`;
        return `["${key}"!~"${valueRegex}"]`;
      })
      .join('');

    const query = `
[out:json][timeout:25];
(
  node(around:${radius},${lat},${lon})
    [${typeKeysQuery}]${negativeFiltersQuery}[~"^name"~"."];
  way(around:${radius},${lat},${lon})
    [${typeKeysQuery}]${negativeFiltersQuery}[~"^name"~"."];
  relation(around:${radius},${lat},${lon})
    [${typeKeysQuery}]${negativeFiltersQuery}[~"^name"~"."];
);
out center;
    `.trim();

    const url = `${this.settings.overpassApi}?data=${encodeURIComponent(query)}`;

    try {
      const res = await this.fetchWithRetry(url, { signal });
      if (!res.ok) throw new Error('Overpass request failed');
      const data = await res.json();

      // Normalize data
      const results = data.elements.map(this.normalizePoi);

      // Update cache
      this.lastQueryKey = queryKey;
      this.cachedResults = results;

      return results;
    } catch (e) {
      if (e.name === 'AbortError') {
        console.debug('Overpass request aborted');
        return [];
      }
      throw e;
    }
  }

  async getCategoryPois(bounds, categoryId, lat, lon) {
    const category = getCategoryById(categoryId);
    if (!category || !bounds) return [];

    const queryKey = lat && lon ? `cat:${categoryId}:${lat}:${lon}` : null;

    if (queryKey && this.lastQueryKey === queryKey && this.cachedResults) {
      console.debug('Returning cached category results for:', queryKey);
      return this.cachedResults;
    }

    if (this.controller) {
      this.controller.abort();
    }
    this.controller = new AbortController();
    const signal = this.controller.signal;

    const { minLat, minLon, maxLat, maxLon } = bounds;

    // Build the query parts for each filter string and type
    const queryParts = [];

    // Default types if not specified (legacy fallback)
    const types = category.types || ['node', 'way', 'relation'];

    category.filter.forEach((filterString) => {
      types.forEach((type) => {
        // We ensure we only fetch named POIs to reduce noise
        queryParts.push(`${type}${filterString}[~"^name"~"."];`);
      });
    });

    const query = `
[out:json][timeout:25][bbox:${minLat},${minLon},${maxLat},${maxLon}];
(
  ${queryParts.join('\n  ')}
);
out center;
    `.trim();

    const url = `${this.settings.overpassApi}?data=${encodeURIComponent(query)}`;

    try {
      const res = await this.fetchWithRetry(url, { signal });
      if (!res.ok) throw new Error('Overpass request failed');
      const data = await res.json();
      const results = data.elements.map(this.normalizePoi);

      if (queryKey) {
        this.lastQueryKey = queryKey;
        this.cachedResults = results;
      }

      return results;
    } catch (e) {
      if (e.name === 'AbortError') {
        console.debug('Category search aborted');
        return [];
      }
      console.error('Category search failed', e);
      throw e;
    }
  }

  normalizePoi(poi) {
    const tags = poi.tags || {};
    const type = getPlaceType(tags) || 'Point of Interest';

    return {
      title: getLocalizedName(tags),
      lat: poi.lat || poi.center?.lat,
      lon: poi.lon || poi.center?.lon,
      url: tags.website,
      osmId: String(poi.id),
      osmType: poi.type,
      osmTags: tags,
      description: tags.description,
      source: 'osm',
      type: type,
    };
  }

  async fetchWithRetry(url, options = {}, retries = 3) {
    try {
      // eslint-disable-next-line warp-drive/no-external-request-patterns
      const res = await fetch(url, options);

      if (!res.ok && retries > 0 && [502, 503, 504, 429].includes(res.status)) {
        console.warn(
          `Overpass request failed with ${res.status}. Retrying... (${retries} left)`
        );
        await new Promise((r) => setTimeout(r, 1000));
        return this.fetchWithRetry(url, options, retries - 1);
      }

      return res;
    } catch (e) {
      if (retries > 0 && e.name !== 'AbortError') {
        console.debug(`Retrying Overpass request... (${retries} left)`);
        await new Promise((r) => setTimeout(r, 1000));
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw e;
    }
  }

  async getPoiById(id, type = null) {
    // If type is provided, we can be specific.
    // If not, we query both node and way.
    let query;

    if (type === 'node') {
      query = `[out:json][timeout:25];node(${id});out center;`;
    } else if (type === 'way') {
      query = `[out:json][timeout:25];way(${id});out center;`;
    } else {
      query = `
[out:json][timeout:25];
(
  node(${id});
  way(${id});
);
out center;
      `.trim();
    }

    const url = `${this.settings.overpassApi}?data=${encodeURIComponent(query)}`;
    const res = await this.fetchWithRetry(url);
    if (!res.ok) throw new Error('Overpass request failed');
    const data = await res.json();
    if (!data.elements[0]) return null;
    return this.normalizePoi(data.elements[0]);
  }

  async fetchOsmObject(osmId, osmType) {
    if (!osmId || !osmType) return null;

    const cacheKey = this._buildCacheKey(osmType, osmId);
    const cached = this.cachedPlaces.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < OsmService.IN_MEMORY_TTL_MS) {
      console.debug(`Using in-memory cached OSM object for ${cacheKey}`);
      return cached.data;
    }

    // If we have a persistent (IndexedDB) cache entry, return it immediately and
    // kick off a background refresh. This keeps the UI snappy while still ensuring
    // the cache is updated with the latest OSM data.
    const localCached = await this._readLocalCache(osmType, osmId);
    if (localCached) {
      console.debug(`Using IndexedDB cached OSM object for ${cacheKey}`);
      // Refresh in the background, but don't block the caller.
      this._refreshOsmObject(osmId, osmType, cacheKey).catch((e) => {
        console.debug('[osm] Background refresh failed for', cacheKey, e);
      });
      return localCached;
    }

    return this._fetchAndCacheOsmObject(osmId, osmType, cacheKey);
  }

  async _refreshOsmObject(osmId, osmType, cacheKey) {
    const fresh = await this._fetchOsmObjectFromApi(osmId, osmType);
    if (fresh) {
      this._storeInMemoryAndLocalStorage(cacheKey, osmType, osmId, fresh);
    }
    return fresh;
  }

  async _fetchAndCacheOsmObject(osmId, osmType, cacheKey) {
    const data = await this._fetchOsmObjectFromApi(osmId, osmType);
    if (data) {
      this._storeInMemoryAndLocalStorage(cacheKey, osmType, osmId, data);
    }
    return data;
  }

  async _fetchOsmObjectFromApi(osmId, osmType) {
    let url;
    if (osmType === 'node') {
      url = `https://www.openstreetmap.org/api/0.6/node/${osmId}.json`;
    } else if (osmType === 'way') {
      url = `https://www.openstreetmap.org/api/0.6/way/${osmId}/full.json`;
    } else if (osmType === 'relation') {
      url = `https://www.openstreetmap.org/api/0.6/relation/${osmId}/full.json`;
    } else {
      console.error('Unknown OSM type:', osmType);
      return null;
    }

    try {
      const res = await this.fetchWithRetry(url);
      if (!res.ok) {
        if (res.status === 410) {
          console.warn('OSM object has been deleted');
          return null;
        }
        throw new Error(`OSM API request failed: ${res.status}`);
      }

      const data = await res.json();
      return this.normalizeOsmApiData(data.elements, osmId, osmType);
    } catch (e) {
      console.error('Failed to fetch OSM object:', e);
      return null;
    }
  }

  /**
   * Batch-fetches multiple OSM objects, using cached data where available and
   * only making network requests for uncached IDs.
   *
   * @param {Array<{osmType: string, osmId: string}>} items
   * @returns {Promise<Map<string, object>>} Map keyed by `${osmType}:${osmId}`
   */
  async fetchOsmObjectsBatch(items) {
    const result = new Map();
    if (!items || items.length === 0) return result;

    // 1. Collect whatever is already cached
    const missing = [];
    for (const { osmType, osmId } of items) {
      if (!osmType || !osmId) continue;
      const cacheKey = this._buildCacheKey(osmType, osmId);
      const cached = await this.getCachedOsmObject(osmType, osmId);
      if (cached) {
        result.set(cacheKey, cached);
      } else {
        missing.push({ osmType, osmId, cacheKey });
      }
    }

    if (missing.length === 0) return result;

    // 2. Group missing items by OSM type for batched API requests
    const byType = new Map();
    for (const item of missing) {
      if (!byType.has(item.osmType)) byType.set(item.osmType, []);
      byType.get(item.osmType).push(item);
    }

    // 3. Fetch each type group from the OSM API (one request per type)
    const fetchPromises = [];
    for (const [osmType, group] of byType) {
      fetchPromises.push(this._fetchOsmObjectsByType(osmType, group, result));
    }

    await Promise.allSettled(fetchPromises);
    return result;
  }

  async _fetchOsmObjectsByType(osmType, group, result) {
    // OSM API supports fetching multiple elements of the same type in a single
    // request using comma-separated IDs (max ~50 per request).
    //
    // Note: the multi-fetch endpoint returns ways/relations WITHOUT their child
    // nodes, so normalized data may lack lat/lon and geometry. We intentionally
    // do NOT write these results to the general OSM cache — only the returned
    // Map is used by the caller (the contributions service manages its own
    // name cache). This prevents incomplete data from breaking place detail
    // navigation, which needs the full single-object endpoint.
    const MAX_IDS_PER_REQUEST = 50;

    for (let i = 0; i < group.length; i += MAX_IDS_PER_REQUEST) {
      const chunk = group.slice(i, i + MAX_IDS_PER_REQUEST);
      const idsParam = chunk.map((c) => c.osmId).join(',');
      const plural = osmType === 'way' ? 'ways' : osmType + 's';
      const url = `https://www.openstreetmap.org/api/0.6/${plural}.json?${plural}=${idsParam}`;

      try {
        const res = await this.fetchWithRetry(url);
        if (!res.ok) {
          console.warn(
            `[osm] Batch fetch failed for ${osmType} (${res.status})`,
            idsParam
          );
          continue;
        }
        const data = await res.json();
        for (const item of chunk) {
          const normalized = this.normalizeOsmApiData(
            data.elements,
            item.osmId,
            osmType
          );
          if (normalized) {
            result.set(item.cacheKey, normalized);
          }
        }
      } catch (e) {
        console.error(`[osm] Batch fetch error for ${osmType}:`, e);
      }
    }
  }

  normalizeOsmApiData(elements, targetId, targetType) {
    if (!elements || elements.length === 0) return null;

    let mainElement = elements.find(
      (el) => String(el.id) === String(targetId) && el.type === targetType
    );

    if (!mainElement) return null;

    // Use a separate variable for the element we want to display (tags, id, specific coords)
    // vs the element we use for geometry calculation (bbox).
    let displayElement = mainElement;

    // If it's a boundary relation, try to find the label or admin_centre node
    // and use that as the display element (better coordinates and tags).
    if (targetType === 'relation' && mainElement.members) {
      const labelMember = mainElement.members.find(
        (m) => m.role === 'label' && m.type === 'node'
      );
      const adminCentreMember = mainElement.members.find(
        (m) => m.role === 'admin_centre' && m.type === 'node'
      );

      const targetMember = labelMember || adminCentreMember;

      if (targetMember) {
        const targetNode = elements.find(
          (el) =>
            String(el.id) === String(targetMember.ref) && el.type === 'node'
        );
        if (targetNode) {
          displayElement = targetNode;
        }
      }
    }

    let lat = displayElement.lat;
    let lon = displayElement.lon;
    let bbox = null;
    let geojson = null;

    // If it's a way, calculate center from nodes
    if (targetType === 'way' && mainElement.nodes) {
      const nodeMap = new Map();
      elements.forEach((el) => {
        if (el.type === 'node') {
          nodeMap.set(el.id, [el.lon, el.lat]);
        }
      });

      const coords = mainElement.nodes
        .map((id) => nodeMap.get(id))
        .filter(Boolean);

      if (coords.length > 0) {
        // Only override lat/lon if we haven't switched to a specific display node
        if (displayElement === mainElement) {
          const sumLat = coords.reduce((sum, c) => sum + c[1], 0);
          const sumLon = coords.reduce((sum, c) => sum + c[0], 0);
          lat = sumLat / coords.length;
          lon = sumLon / coords.length;
        }

        // Calculate BBox
        const lats = coords.map((c) => c[1]);
        const lons = coords.map((c) => c[0]);
        bbox = {
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
          minLon: Math.min(...lons),
          maxLon: Math.max(...lons),
        };

        // Construct GeoJSON
        if (coords.length > 1) {
          const first = coords[0];
          const last = coords[coords.length - 1];
          const isClosed = first[0] === last[0] && first[1] === last[1];

          if (isClosed) {
            geojson = {
              type: 'Polygon',
              coordinates: [coords],
            };
          } else {
            geojson = {
              type: 'LineString',
              coordinates: coords,
            };
          }
        }
      }
    } else if (targetType === 'relation' && mainElement.members) {
      // Find all nodes that are part of this relation (directly or via ways)
      const allNodes = [];
      const nodeMap = new Map();
      elements.forEach((el) => {
        if (el.type === 'node') {
          nodeMap.set(el.id, el);
        }
      });

      const segments = [];

      mainElement.members.forEach((member) => {
        if (member.type === 'node') {
          const node = nodeMap.get(member.ref);
          if (node) allNodes.push(node);
        } else if (member.type === 'way') {
          const way = elements.find(
            (el) => el.type === 'way' && el.id === member.ref
          );
          if (way && way.nodes) {
            const wayCoords = [];
            way.nodes.forEach((nodeId) => {
              const node = nodeMap.get(nodeId);
              if (node) {
                allNodes.push(node);
                wayCoords.push([node.lon, node.lat]);
              }
            });
            if (wayCoords.length > 1) {
              segments.push(wayCoords);
            }
          }
        }
      });

      if (allNodes.length > 0) {
        // Only override lat/lon if we haven't switched to a specific display node
        if (displayElement === mainElement) {
          const sumLat = allNodes.reduce((sum, n) => sum + n.lat, 0);
          const sumLon = allNodes.reduce((sum, n) => sum + n.lon, 0);
          lat = sumLat / allNodes.length;
          lon = sumLon / allNodes.length;
        }

        // Calculate BBox
        const lats = allNodes.map((n) => n.lat);
        const lons = allNodes.map((n) => n.lon);
        bbox = {
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
          minLon: Math.min(...lons),
          maxLon: Math.max(...lons),
        };
      }

      if (segments.length > 0) {
        geojson = {
          type: 'MultiLineString',
          coordinates: segments,
        };
      }
    }

    const tags = displayElement.tags || {};
    const type = getPlaceType(tags) || 'Point of Interest';

    return {
      title: getLocalizedName(tags),
      lat,
      lon,
      bbox,
      geojson,
      url: tags.website,
      osmId: String(displayElement.id),
      osmType: displayElement.type,
      osmTags: tags,
      description: tags.description,
      source: 'osm',
      type: type,
    };
  }
}

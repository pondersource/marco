import Service, { service } from '@ember/service';
import { getLocalizedName, getPlaceType } from '../utils/osm';

export default class OsmService extends Service {
  @service settings;

  controller = null;
  cachedResults = null;
  lastQueryKey = null;

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

    const query = `
[out:json][timeout:25];
(
  nw["amenity"](around:${radius},${lat},${lon});
  nw["shop"](around:${radius},${lat},${lon});
  nw["tourism"](around:${radius},${lat},${lon});
  nw["leisure"](around:${radius},${lat},${lon});
  nw["historic"](around:${radius},${lat},${lon});
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

  normalizeOsmApiData(elements, targetId, targetType) {
    if (!elements || elements.length === 0) return null;

    const mainElement = elements.find(
      (el) => String(el.id) === String(targetId) && el.type === targetType
    );

    if (!mainElement) return null;

    let lat = mainElement.lat;
    let lon = mainElement.lon;

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
        // Simple average center
        const sumLat = coords.reduce((sum, c) => sum + c[1], 0);
        const sumLon = coords.reduce((sum, c) => sum + c[0], 0);
        lat = sumLat / coords.length;
        lon = sumLon / coords.length;
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

      mainElement.members.forEach((member) => {
        if (member.type === 'node') {
          const node = nodeMap.get(member.ref);
          if (node) allNodes.push(node);
        } else if (member.type === 'way') {
          const way = elements.find(
            (el) => el.type === 'way' && el.id === member.ref
          );
          if (way && way.nodes) {
            way.nodes.forEach((nodeId) => {
              const node = nodeMap.get(nodeId);
              if (node) allNodes.push(node);
            });
          }
        }
      });

      if (allNodes.length > 0) {
        const sumLat = allNodes.reduce((sum, n) => sum + n.lat, 0);
        const sumLon = allNodes.reduce((sum, n) => sum + n.lon, 0);
        lat = sumLat / allNodes.length;
        lon = sumLon / allNodes.length;
      }
    }

    const tags = mainElement.tags || {};
    const type = getPlaceType(tags) || 'Point of Interest';

    return {
      title: getLocalizedName(tags),
      lat,
      lon,
      url: tags.website,
      osmId: String(mainElement.id),
      osmType: mainElement.type,
      osmTags: tags,
      description: tags.description,
      source: 'osm',
      type: type,
    };
  }
}

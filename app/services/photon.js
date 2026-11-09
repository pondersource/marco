import Service, { service } from '@ember/service';
import { getPlaceType } from '../utils/osm';
import { humanizeOsmTag } from '../utils/format-text';
import { hasCoordinates } from '../utils/geo';

export default class PhotonService extends Service {
  @service settings;

  controller = null;

  cancelAll() {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  get baseUrl() {
    return this.settings.photonApi;
  }

  async search(query, lat, lon, limit = 10) {
    if (!query || query.length < 2) return [];

    if (this.controller) {
      this.controller.abort();
    }
    this.controller = new AbortController();
    const signal = this.controller.signal;

    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
    });

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (hasCoordinates(latitude, longitude)) {
      params.append('lat', latitude.toFixed(4));
      params.append('lon', longitude.toFixed(4));
    }

    const url = `${this.baseUrl}?${params.toString()}`;

    try {
      const res = await this.fetchWithRetry(url, { signal });
      if (!res.ok) {
        throw new Error(`Photon request failed with status ${res.status}`);
      }
      const data = await res.json();

      if (!data.features) return [];

      return data.features.map((f) => this.normalizeFeature(f));
    } catch (e) {
      if (e.name === 'AbortError') {
        return [];
      }
      console.error('Photon search error:', e);
      // Return empty array on error so UI doesn't break
      return [];
    }
  }

  normalizeFeature(feature) {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const coords = geom.coordinates || [];

    // Photon returns [lon, lat] for Point geometries
    const lon = coords[0];
    const lat = coords[1];

    // Construct a description from address fields
    // Priority: name -> street -> city -> state -> country
    const addressParts = [];
    if (props.street)
      addressParts.push(
        props.housenumber
          ? `${props.street} ${props.housenumber}`
          : props.street
      );
    if (props.city && props.city !== props.name) addressParts.push(props.city);
    if (props.state && props.state !== props.city)
      addressParts.push(props.state);
    if (props.country) addressParts.push(props.country);

    const description = addressParts.join(', ');
    const title = props.name || description || 'Unknown Place';

    const osmTypeMap = {
      N: 'node',
      W: 'way',
      R: 'relation',
    };

    const osmTags = { ...props };
    // Photon often returns osm_key and osm_value for the main tag
    if (props.osm_key && props.osm_value) {
      osmTags[props.osm_key] = props.osm_value;
    }

    const type = getPlaceType(osmTags) || humanizeOsmTag(props.osm_value);

    return {
      title,
      lat,
      lon,
      osmId: props.osm_id,
      osmType: osmTypeMap[props.osm_type] || props.osm_type, // 'node', 'way', 'relation'
      osmTags,
      description: props.name ? description : addressParts.slice(1).join(', '),
      source: 'photon',
      type: type,
    };
  }

  async fetchWithRetry(url, options = {}, retries = 3) {
    try {
      // eslint-disable-next-line warp-drive/no-external-request-patterns
      const res = await fetch(url, options);

      // Retry on 5xx errors or 429 Too Many Requests
      if (!res.ok && retries > 0 && [502, 503, 504, 429].includes(res.status)) {
        console.warn(
          `Photon request failed with ${res.status}. Retrying... (${retries} left)`
        );
        // Exponential backoff or fixed delay? Let's do 1s fixed delay for simplicity
        await new Promise((r) => setTimeout(r, 1000));
        return this.fetchWithRetry(url, options, retries - 1);
      }

      return res;
    } catch (e) {
      // Retry on network errors (fetch throws) except AbortError
      if (retries > 0 && e.name !== 'AbortError') {
        console.debug(`Retrying Photon request... (${retries} left)`, e);
        await new Promise((r) => setTimeout(r, 1000));
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw e;
    }
  }
}

import Geohash from 'latlon-geohash';

/**
 * Calculates 4-character geohash prefixes that cover the given bounding box.
 *
 * @param {Object} bbox
 * @param {number} bbox.minLat
 * @param {number} bbox.minLon
 * @param {number} bbox.maxLat
 * @param {number} bbox.maxLon
 * @returns {string[]} Array of unique 4-character geohash prefixes
 */
export function getGeohashPrefixesInBbox(bbox) {
  const { minLat, minLon, maxLat, maxLon } = bbox;
  const prefixes = new Set();

  // 4-char geohash precision is approx 20km x 39km at equator.
  // We can step through the bbox in increments smaller than that to ensure coverage.
  // Latitude: 1 deg ~= 111km. 20km ~= 0.18 deg.
  // Longitude: 1 deg ~= 111km (at equator). 39km ~= 0.35 deg.
  // Let's use conservative steps to hit every cell.
  // 0.1 degree steps should be safe enough for 4-char hashes.

  // Safety check to avoid infinite loops or massive arrays if bbox is weird
  if (Math.abs(maxLat - minLat) > 20 || Math.abs(maxLon - minLon) > 20) {
    console.warn(
      'BBox too large for 4-char geohash scanning, aborting fine scan.'
    );
    return [];
  }

  const latStep = 0.1;
  const lonStep = 0.1;

  for (let lat = minLat; lat <= maxLat + latStep; lat += latStep) {
    for (let lon = minLon; lon <= maxLon + lonStep; lon += lonStep) {
      // Clamp to bbox for the edge cases
      const cLat = Math.min(lat, maxLat);
      const cLon = Math.min(lon, maxLon);

      try {
        const hash = Geohash.encode(cLat, cLon, 4);
        prefixes.add(hash);
        // eslint-disable-next-line no-unused-vars
      } catch (e) {
        // Ignore invalid coords if any
      }
    }
  }

  // Ensure corners are definitely included (floating point steps might miss slightly)
  try {
    prefixes.add(Geohash.encode(minLat, minLon, 4));
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    /* ignore */
  }
  try {
    prefixes.add(Geohash.encode(maxLat, maxLon, 4));
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    /* ignore */
  }
  try {
    prefixes.add(Geohash.encode(minLat, maxLon, 4));
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    /* ignore */
  }
  try {
    prefixes.add(Geohash.encode(maxLat, minLon, 4));
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    /* ignore */
  }

  return Array.from(prefixes);
}

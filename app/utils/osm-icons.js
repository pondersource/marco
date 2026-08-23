import { getIcon } from './icons';

// Rules for mapping OSM tags to icons.
// Rules are evaluated in order. The first rule where all specified tags match is used.
export const POI_ICON_RULES = [
  // Specific Cuisine
  { tags: { cuisine: 'donut' }, icon: 'donut' },
  { tags: { cuisine: 'doughnut' }, icon: 'donut' },
  { tags: { cuisine: 'coffee_shop' }, icon: 'coffee-bean' },
  { tags: { cuisine: 'coffee' }, icon: 'coffee-bean' },

  { tags: { craft: 'brewery' }, icon: 'barrel-with-bunghole' },

  // General Amenity/Shop Types
  { tags: { amenity: 'ice_cream' }, icon: 'ice-cream-on-cone' },
  { tags: { cuisine: 'ice_cream' }, icon: 'ice-cream-on-cone' },
  { tags: { shop: 'ice_cream' }, icon: 'ice-cream-on-cone' },

  { tags: { amenity: 'cafe' }, icon: 'cup-and-saucer' },
  { tags: { amenity: 'restaurant' }, icon: 'fork-and-knife' },
  { tags: { amenity: 'fast_food' }, icon: 'burger-and-drink-cup-with-straw' },
  { tags: { amenity: 'pub' }, icon: 'beer-mug-with-foam' },
  { tags: { amenity: 'bar' }, icon: 'cocktail' },
  { tags: { amenity: 'food_court' }, icon: 'fork-and-knife' },
  { tags: { amenity: 'childcare' }, icon: 'family-restroom-symbol' },
  { tags: { amenity: 'community_centre' }, icon: 'family-restroom-symbol' },
  { tags: { amenity: 'social_centre' }, icon: 'family-restroom-symbol' },
  { tags: { amenity: 'social_facility' }, icon: 'family-restroom-symbol' },

  { tags: { amenity: 'bank' }, icon: 'banknote' },
  { tags: { amenity: 'atm' }, icon: 'banknote-in-slot' },
  { tags: { amenity: 'bureau_de_change' }, icon: 'dollar-swap-to-euro' },
  { tags: { amenity: 'place_of_worship' }, icon: 'place-of-worship-building' },
  { tags: { amenity: 'townhall' }, icon: 'classical-building-with-clock' },
  { tags: { building: 'townhall' }, icon: 'classical-building-with-clock' },
  { tags: { amenity: 'fire_station' }, icon: 'badge-shield-with-fire' },
  { tags: { amenity: 'police' }, icon: 'police-officer-with-stop-arm' },
  { tags: { amenity: 'toilets' }, icon: 'womens-and-mens-restroom-symbol' },
  { tags: { amenity: 'smoking_area' }, icon: 'cigarette-with-smoke-curl' },
  { tags: { amenity: 'lounge' }, icon: 'couch' },
  {
    tags: { amenity: 'drinking_water' },
    icon: 'water-standpipe-with-handle-and-drinking-glass',
  },
  { tags: { amenity: 'school' }, icon: 'open-book' },
  { tags: { amenity: 'driving_school' }, icon: 'car' },
  { tags: { amenity: 'car_wash' }, icon: 'car-between-roller-brushes' },
  { tags: { amenity: 'fuel' }, icon: 'gasoline-pump' },

  { tags: { shop: 'coffee' }, icon: 'coffee-bean' },
  { tags: { shop: 'tea' }, icon: 'coffee-bean' },
  { tags: { shop: 'pastry' }, icon: 'donut' },

  // Shopping
  { tags: { shop: 'supermarket' }, icon: 'shopping-cart' },
  { tags: { shop: 'convenience' }, icon: 'shopping-basket' },
  { tags: { shop: 'grocery' }, icon: 'shopping-basket' },
  { tags: { shop: 'greengrocer' }, icon: 'shopping-basket' },
  { tags: { shop: 'bakery' }, icon: 'croissant' },
  { tags: { shop: 'butcher' }, icon: 'cleaver' },
  { tags: { shop: 'seafood' }, icon: 'fish' },
  { tags: { shop: 'deli' }, icon: 'shopping-basket' },
  { tags: { shop: 'clothes' }, icon: 'clothes-hanger' },
  { tags: { shop: 'clothing' }, icon: 'clothes-hanger' },
  { tags: { shop: 'hairdresser' }, icon: 'scissors-open' },
  { tags: { shop: 'optician' }, icon: 'eyeglasses' },
  { tags: { shop: 'fabric' }, icon: 'cloth' },
  { tags: { shop: 'flea_market' }, icon: 'market-stall' },
  { tags: { shop: 'kiosk' }, icon: 'shopping-basket' },
  { tags: { shop: 'leather' }, icon: 'shopping-bag' },
  { tags: { shop: 'tailor' }, icon: 'needle-and-spool-of-thread' },
  { tags: { shop: 'jewelry' }, icon: 'jewel' },
  { tags: { shop: 'jewellery' }, icon: 'jewel' },
  { tags: { shop: 'tobacco' }, icon: 'cigarette-with-smoke-curl' },
  { tags: { shop: 'cannabis' }, icon: 'cigarette-with-smoke-curl' },
  { tags: { shop: 'florist' }, icon: 'flower-bouquet' },
  { tags: { shop: 'garden_centre' }, icon: 'plant-in-raised-planter' },
  { tags: { shop: 'estate_agent' }, icon: 'village-buildings' },
  {
    tags: { shop: 'mobile_phone' },
    icon: 'mobile-phone-with-keypad-and-antenna',
  },
  { tags: { beauty: 'nails' }, icon: 'fingernail-polished' },
  { tags: { shop: 'tattoo' }, icon: 'tattoo-machine' },
  {
    tags: { shop: 'beauty' },
    icon: 'fancy-mirror-with-reflection-and-stars',
  },
  { tags: { shop: 'car_repair' }, icon: 'car-and-wrench' },
  { tags: { craft: 'tailor' }, icon: 'needle-and-spool-of-thread' },
  { tags: { office: 'estate_agent' }, icon: 'village-buildings' },
  { tags: { office: true }, icon: 'commercial-building' },
  { tags: { craft: true }, icon: 'toolbox' },
  { tags: { shop: true }, icon: 'shopping-bag' },

  // Natural
  { tags: { natural: 'beach' }, icon: 'beach-umbrella-in-ground' },
  { tags: { leisure: 'park' }, icon: 'tree-and-bench-with-backrest' },
  { tags: { leisure: 'playground' }, icon: 'play-structure-with-slide' },
  { tags: { leisure: 'marina' }, icon: 'anchor' },
  { tags: { landuse: 'vineyard' }, icon: 'grapes' },

  // Transport
  { tags: { aeroway: 'aerodrome' }, icon: 'plane-top-right' },
  { tags: { aeroway: 'terminal' }, icon: 'airport-terminal' },
  { tags: { aeroway: 'heliport' }, icon: 'plane-top-right' },
  { tags: { aeroway: 'helipad' }, icon: 'plane-top-right' },
  { tags: { highway: 'bus_stop' }, icon: 'bus' },
  { tags: { bus: true }, icon: 'bus' },
  {
    tags: { railway: 'tram_stop' },
    icon: 'person-boarding-tram-with-destination-display-and-pantograph-on-tram-track',
  },

  // Tourism
  { tags: { tourism: 'museum' }, icon: 'classical-building' },
  { tags: { tourism: 'gallery' }, icon: 'wall-hanging-with-mountains-and-sun' },
  { tags: { tourism: 'aquarium' }, icon: 'angelfish' },
  { tags: { tourism: 'theme_park' }, icon: 'camera' },
  { tags: { tourism: 'attraction' }, icon: 'camera' },
  { tags: { tourism: 'viewpoint' }, icon: 'camera' },
  { tags: { tourism: 'zoo' }, icon: 'camera' },
  { tags: { tourism: 'artwork' }, icon: 'camera' },
  { tags: { tourism: 'information' }, icon: 'info-i' },
  { tags: { amenity: 'cinema' }, icon: 'film' },
  { tags: { amenity: 'theatre' }, icon: 'camera' },
  { tags: { amenity: 'arts_centre' }, icon: 'comedy-mask-and-tragedy-mask' },
  { tags: { amenity: 'arts_center' }, icon: 'comedy-mask-and-tragedy-mask' },

  // Historic
  { tags: { historic: 'canal' }, icon: 'winding_way_wide' },
  { tags: { historic: 'bridge' }, icon: 'bridge' },
  { tags: { historic: 'bridge_site' }, icon: 'bridge' },
  { tags: { historic: 'fort' }, icon: 'fort' },
  { tags: { historic: 'city_gate' }, icon: 'city-gate' },
  { tags: { historic: 'castle' }, icon: 'palace' },
  { tags: { building: 'tower', historic: 'yes' }, icon: 'castle-keep' },
  { tags: { historic: 'building' }, icon: 'classical-building-with-flag' },
  { tags: { historic: 'archaeological_site' }, icon: 'grecian-vase' },
  { tags: { historic: 'memorial' }, icon: 'memorial-stone-with-inscription' },
  { tags: { historic: 'tomb' }, icon: 'gravestone' },
  {
    tags: { historic: 'monument' },
    icon: 'classical-building-with-dome-and-flag',
  },
  { tags: { historic: 'folly' }, icon: 'classical-building' },
  { tags: { historic: 'industrial' }, icon: 'industrial-building' },
  {
    tags: { historic: 'railway_station' },
    icon: 'steam-train-on-railway-track',
  },
  { tags: { historic: 'ship' }, icon: 'sailing-ship-in-water' },
  { tags: { historic: 'wreck' }, icon: 'shipwreck-in-water' },
  { tags: { historic: 'ruins' }, icon: 'camera' },
  { tags: { historic: 'ruin' }, icon: 'camera' },
  { tags: { historic: 'yes' }, icon: 'camera' },

  // Accommodation
  { tags: { tourism: 'hotel' }, icon: 'person-sleeping-in-bed' },
  { tags: { tourism: 'hostel' }, icon: 'person-sleeping-in-bed' },
  { tags: { tourism: 'motel' }, icon: 'person-sleeping-in-bed' },
  { tags: { tourism: 'guest_house' }, icon: 'person-sleeping-in-bed' },

  // Sports / Motorsports
  { tags: { sport: 'motor' }, icon: 'flag-checkered' },
  { tags: { sport: 'karting' }, icon: 'flag-checkered' },
  { tags: { sport: 'motocross' }, icon: 'flag-checkered' },
  {
    tags: { sport: 'cricket' },
    icon: 'person-cricket-batting-at-cricket-ball',
  },
  { tags: { sport: 'boxing' }, icon: 'boxing-glove-up' },
  { tags: { sport: 'martial_arts' }, icon: 'boxing-glove-up' },
  { tags: { sport: 'tennis' }, icon: 'person-playing-tennis' },
  { tags: { sport: 'squash' }, icon: 'person-playing-tennis' },
  { tags: { sport: 'padel' }, icon: 'person-playing-tennis' },
  { tags: { sport: 'table_tennis' }, icon: 'table-tennis-paddle' },
  { tags: { sport: 'climbing' }, icon: 'climbing_wall' },
  { tags: { leisure: 'water_park' }, icon: 'person-swimming-in-water' },
  { tags: { sport: 'swimming' }, icon: 'person-swimming-in-water' },
  { tags: { sport: 'golf' }, icon: 'person-swinging-golf-club' },
  { tags: { leisure: 'golf_course' }, icon: 'person-swinging-golf-club' },
  { tags: { sport: 'horse_racing' }, icon: 'person-jockeying-racehorse' },
  { tags: { sport: 'fitness' }, icon: 'barbell' },
  { tags: { sport: 'fitness_centre' }, icon: 'barbell' },
  { tags: { leisure: 'fitness_centre' }, icon: 'barbell' },

  { tags: { sport: 'stadium' }, icon: 'round-structure-with-flag' },
  { tags: { leisure: 'stadium' }, icon: 'round-structure-with-flag' },
  { tags: { leisure: 'sports_centre' }, icon: 'person-running' },
  { tags: { leisure: 'pitch' }, icon: 'person-running' },
  { tags: { sport: true }, icon: 'person-running' },

  // Healthcare
  { tags: { amenity: 'dentist' }, icon: 'molar-tooth' },
  { tags: { healthcare: 'dentist' }, icon: 'molar-tooth' },
  { tags: { healthcare: true }, icon: 'greek-cross' },

  // Parking
  { tags: { amenity: 'parking' }, icon: 'parking_p' },

  // Buildings
  { tags: { building: 'commercial' }, icon: 'commercial-building' },
  { tags: { building: 'apartments' }, icon: 'lowrise-building' },
  { tags: { building: 'office' }, icon: 'lowrise-building' },
];

/**
 * Finds the appropriate icon name based on the place's OSM tags.
 * @param {Object} tags - The OSM tags of the place.
 * @returns {string|null} - The name of the icon or null if no match found.
 */
export function getIconNameForTags(tags) {
  if (!tags) return null;

  for (const rule of POI_ICON_RULES) {
    let match = true;
    for (const [key, expectedValue] of Object.entries(rule.tags)) {
      const tagValue = tags[key];
      if (!tagValue) {
        match = false;
        break;
      }

      // Check for exact match or if value is in a semicolon-separated list
      // e.g. "donut;coffee_shop"
      const values = tagValue.split(';').map((v) => v.trim());

      // If expectedValue is boolean true, any value is a match
      if (expectedValue === true) {
        continue;
      }

      if (!values.includes(expectedValue)) {
        match = false;
        break;
      }
    }
    if (match) {
      return rule.icon;
    }
  }
  return null;
}

/**
 * Returns the raw SVG string for the icon corresponding to the given tags.
 * @param {Object} tags - The OSM tags.
 * @returns {string|null} - The raw SVG string or null.
 */
export function getIconSvgForTags(tags) {
  const iconName = getIconNameForTags(tags);
  if (!iconName) return null;
  return getIcon(iconName);
}

// This configuration defines the "Quick Search" categories available in the UI.
//
// Structure:
// - id: The URL slug used for routing (e.g. ?category=restaurants)
// - label: The human-readable name displayed in the UI
// - icon: The icon name (must be registered in app/utils/icons.js)
// - filter: An array of Overpass QL query parts.
//   - Each string in the array is an independent query condition.
//   - Multiple strings act as an OR condition (union of results).

export const POI_CATEGORIES = [
  {
    id: 'restaurants',
    label: 'Restaurants',
    icon: 'search', // Placeholder
    filter: ['["amenity"~"^(restaurant|fast_food|food_court|pub|cafe)$"]'],
    types: ['node', 'way'],
  },
  {
    id: 'coffee',
    label: 'Coffee',
    icon: 'search', // Placeholder
    filter: [
      '["amenity"~"^(cafe|ice_cream)$"]',
      '["shop"~"^(coffee|tea)$"]',
      '["cuisine"~"coffee_shop"]',
    ],
    types: ['node', 'way'],
  },
  {
    id: 'groceries',
    label: 'Groceries',
    icon: 'search', // Placeholder
    filter: [
      '["shop"~"^(supermarket|convenience|grocery|greengrocer|bakery|butcher|deli|farm|seafood)$"]',
    ],
    types: ['node', 'way'],
  },
  {
    id: 'attractions',
    label: 'Attractions',
    icon: 'search', // Placeholder
    filter: [
      '["tourism"~"^(museum|gallery|attraction|viewpoint|zoo|theme_park)$"]',
      '["historic"]',
    ],
    types: ['node', 'way', 'relation'],
  },
  {
    id: 'accommodation',
    label: 'Hotels',
    icon: 'search', // Placeholder
    filter: ['["tourism"~"^(hotel|hostel|guest_house|apartment|motel)$"]'],
    types: ['node', 'way', 'relation'],
  },
];

export function getCategoryById(id) {
  return POI_CATEGORIES.find((c) => c.id === id);
}

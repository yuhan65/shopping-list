/**
 * Shopping-list intelligence — classifies ingredients into supermarket
 * sections, converts impractical units (like "cloves") into buyable ones
 * (like "grams"), and filters out items nobody needs to purchase.
 */

// ── Items you never need to add to a shopping list ──────────────────────────
const SKIP_SET = new Set([
  'water', 'cold water', 'hot water', 'warm water', 'boiling water',
  'ice water', 'ice', 'ice cubes', 'tap water', 'filtered water',
  'room temperature water',
]);

export function shouldSkipItem(name: string): boolean {
  return SKIP_SET.has(name.trim().toLowerCase());
}

// ── Unit conversion (impractical → buyable) ─────────────────────────────────
// Maps ingredient keyword → { unit: grams-per-one-unit }.
// Only covers units that don't make sense on a shopping list at scale.
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  garlic:  { clove: 5, cloves: 5 },
  ginger:  { piece: 25, inch: 15, knob: 25 },
  shallot: { piece: 60, whole: 60 },
  lemongrass: { stalk: 25, piece: 25 },
};

function wordMatch(text: string, word: string): boolean {
  const re = new RegExp(`\\b${word}\\b`, 'i');
  return re.test(text);
}

/**
 * Convert units that are impractical for a shopping list
 * (e.g. "23 cloves garlic") into weight-based units ("120 g garlic").
 * Does NOT round — caller should use `roundForShopping` on final totals.
 */
export function convertToShoppableUnit(
  name: string,
  quantity: number,
  unit: string,
): { quantity: number; unit: string } {
  const u = unit.trim().toLowerCase();
  for (const [itemKey, unitRules] of Object.entries(UNIT_CONVERSIONS)) {
    if (wordMatch(name, itemKey)) {
      const factor = unitRules[u];
      if (factor !== undefined) {
        return { quantity: quantity * factor, unit: 'g' };
      }
    }
  }
  return { quantity, unit };
}

/** Round converted quantities to clean shopping-friendly numbers. */
export function roundForShopping(quantity: number, unit: string): number {
  if (unit === 'g') {
    if (quantity <= 50) return Math.ceil(quantity / 5) * 5;
    return Math.ceil(quantity / 10) * 10;
  }
  return Math.ceil(quantity * 10) / 10;
}

// ── Ingredient → supermarket section classifier ─────────────────────────────
// Checked FIRST — handles compound/ambiguous names that would otherwise
// match the wrong single keyword.
const SPECIFIC_OVERRIDES: Record<string, string> = {
  // Spices that contain a vegetable word
  'garlic powder': 'Spices & Seasonings',
  'onion powder': 'Spices & Seasonings',
  'celery salt': 'Spices & Seasonings',
  'celery seed': 'Spices & Seasonings',
  'chili powder': 'Spices & Seasonings',
  'chilli powder': 'Spices & Seasonings',
  'mustard powder': 'Spices & Seasonings',
  'ginger powder': 'Spices & Seasonings',
  'ground ginger': 'Spices & Seasonings',
  'dried ginger': 'Spices & Seasonings',

  // Oils
  'olive oil': 'Sauces & Oils',
  'coconut oil': 'Sauces & Oils',
  'sesame oil': 'Sauces & Oils',
  'avocado oil': 'Sauces & Oils',
  'vegetable oil': 'Sauces & Oils',
  'canola oil': 'Sauces & Oils',
  'peanut oil': 'Sauces & Oils',
  'sunflower oil': 'Sauces & Oils',

  // Sauces
  'soy sauce': 'Sauces & Oils',
  'fish sauce': 'Sauces & Oils',
  'oyster sauce': 'Sauces & Oils',
  'hoisin sauce': 'Sauces & Oils',
  'teriyaki sauce': 'Sauces & Oils',
  'hot sauce': 'Sauces & Oils',
  'worcestershire sauce': 'Sauces & Oils',

  // Nut butters
  'peanut butter': 'Sauces & Oils',
  'almond butter': 'Sauces & Oils',
  'tahini': 'Sauces & Oils',

  // Canned & jarred
  'tomato sauce': 'Canned & Jarred',
  'tomato paste': 'Canned & Jarred',
  'crushed tomatoes': 'Canned & Jarred',
  'crushed tomato': 'Canned & Jarred',
  'diced tomatoes': 'Canned & Jarred',
  'diced tomato': 'Canned & Jarred',
  'tomato puree': 'Canned & Jarred',
  'canned tomatoes': 'Canned & Jarred',
  'coconut milk': 'Canned & Jarred',
  'coconut cream': 'Canned & Jarred',
  'chicken broth': 'Canned & Jarred',
  'beef broth': 'Canned & Jarred',
  'vegetable broth': 'Canned & Jarred',
  'chicken stock': 'Canned & Jarred',
  'beef stock': 'Canned & Jarred',
  'vegetable stock': 'Canned & Jarred',
  'canned beans': 'Canned & Jarred',
  'canned chickpeas': 'Canned & Jarred',

  // Dairy that contains ambiguous words
  'cream cheese': 'Dairy & Eggs',
  'sour cream': 'Dairy & Eggs',
  'cottage cheese': 'Dairy & Eggs',
  'greek yogurt': 'Dairy & Eggs',
  'plain greek yogurt': 'Dairy & Eggs',
  'plain yogurt': 'Dairy & Eggs',
  'whipped cream': 'Dairy & Eggs',
  'heavy cream': 'Dairy & Eggs',
  'half and half': 'Dairy & Eggs',

  // Vinegars
  'rice vinegar': 'Sauces & Oils',
  'balsamic vinegar': 'Sauces & Oils',
  'apple cider vinegar': 'Sauces & Oils',
  'white vinegar': 'Sauces & Oils',
  'red wine vinegar': 'Sauces & Oils',

  // Sugars / baking → Spices & Seasonings aisle
  'brown sugar': 'Spices & Seasonings',
  'powdered sugar': 'Spices & Seasonings',
  'vanilla extract': 'Spices & Seasonings',
  'almond extract': 'Spices & Seasonings',
  'baking soda': 'Spices & Seasonings',
  'baking powder': 'Spices & Seasonings',
  'bay leaf': 'Spices & Seasonings',
  'bay leaves': 'Spices & Seasonings',

  // Produce compounds
  'sweet potato': 'Vegetables & Herbs',
  'bell pepper': 'Vegetables & Herbs',
  'green bean': 'Vegetables & Herbs',
  'green beans': 'Vegetables & Herbs',
  'green onion': 'Vegetables & Herbs',
  'spring onion': 'Vegetables & Herbs',
  'bean sprout': 'Vegetables & Herbs',
  'bean sprouts': 'Vegetables & Herbs',
  'mixed vegetables': 'Vegetables & Herbs',
  'bok choy': 'Vegetables & Herbs',

  // Fruits
  'mixed berries': 'Fruits',
  'passion fruit': 'Fruits',

  // Protein alternatives
  'tofu': 'Meat & Poultry',
  'tempeh': 'Meat & Poultry',
  'seitan': 'Meat & Poultry',

  // Drinks
  'unsweetened tea': 'Snacks & Drinks',
  'herbal tea': 'Snacks & Drinks',
  'green tea': 'Snacks & Drinks',
  'maple syrup': 'Sauces & Oils',
  'honey': 'Sauces & Oils',
  'agave': 'Sauces & Oils',
};

// Keyword lists for fallback matching. Order matters — first match wins.
const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  {
    category: 'Spices & Seasonings',
    keywords: [
      'cumin', 'paprika', 'smoked paprika', 'oregano', 'thyme', 'rosemary',
      'cinnamon', 'nutmeg', 'turmeric', 'cayenne', 'coriander', 'cardamom',
      'allspice', 'clove', 'star anise', 'saffron', 'sumac', 'zaatar',
      'curry powder', 'garam masala', 'five spice', 'chili flake',
      'fennel seed', 'mustard seed', 'poppy seed', 'sesame seed',
      'vanilla', 'cocoa', 'chocolate chip',
      'sugar', 'yeast', 'cream of tartar', 'cornstarch',
      'seasoning', 'spice', 'rub', 'extract', 'nutritional yeast',
      'black pepper', 'white pepper', 'pepper flake', 'red pepper flake',
      'salt',
    ],
  },
  {
    category: 'Sauces & Oils',
    keywords: [
      'oil', 'vinegar', 'balsamic', 'ketchup', 'mustard', 'mayonnaise',
      'mayo', 'sriracha', 'tabasco', 'mirin', 'cooking wine', 'sake',
      'salsa', 'pesto', 'marinade',
    ],
  },
  {
    category: 'Canned & Jarred',
    keywords: [
      'canned', 'broth', 'stock', 'bouillon', 'marinara',
      'jam', 'jelly', 'preserve', 'marmalade',
      'pickle', 'caper', 'sun-dried',
    ],
  },
  {
    category: 'Dairy & Eggs',
    keywords: [
      'milk', 'cheese', 'yogurt', 'cream', 'butter', 'egg',
      'mozzarella', 'parmesan', 'cheddar', 'swiss', 'brie', 'feta',
      'gouda', 'ricotta', 'mascarpone', 'ghee', 'buttermilk', 'kefir',
    ],
  },
  {
    category: 'Meat & Poultry',
    keywords: [
      'chicken', 'beef', 'pork', 'turkey', 'lamb', 'duck', 'veal',
      'venison', 'bison', 'bacon', 'sausage', 'ham', 'prosciutto',
      'pancetta', 'salami', 'pepperoni', 'steak', 'tenderloin',
      'sirloin', 'brisket', 'meatball', 'ground meat',
    ],
  },
  {
    category: 'Seafood',
    keywords: [
      'shrimp', 'prawn', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut',
      'swordfish', 'trout', 'bass', 'catfish', 'snapper', 'sardine',
      'anchovy', 'mackerel', 'crab', 'lobster', 'scallop', 'mussel',
      'clam', 'oyster', 'squid', 'calamari', 'octopus', 'fish', 'seafood',
    ],
  },
  {
    category: 'Fruits',
    keywords: [
      'apple', 'banana', 'orange', 'lemon', 'lime', 'grapefruit',
      'tangerine', 'mandarin', 'berry', 'blueberry', 'strawberry',
      'raspberry', 'blackberry', 'cranberry', 'grape', 'raisin', 'cherry',
      'plum', 'peach', 'nectarine', 'apricot', 'pear', 'fig', 'date',
      'prune', 'mango', 'papaya', 'pineapple', 'kiwi', 'guava', 'lychee',
      'watermelon', 'cantaloupe', 'honeydew', 'melon', 'avocado',
      'coconut', 'pomegranate', 'fruit',
    ],
  },
  {
    category: 'Vegetables & Herbs',
    keywords: [
      'garlic', 'onion', 'shallot', 'scallion', 'leek', 'chive',
      'broccoli', 'cauliflower', 'cabbage', 'kale', 'spinach', 'lettuce',
      'arugula', 'carrot', 'celery', 'pepper', 'jalapeño', 'jalapeno',
      'chili', 'tomato', 'cucumber', 'zucchini', 'squash', 'eggplant',
      'potato', 'yam', 'mushroom', 'shiitake', 'portobello',
      'corn', 'pea', 'edamame', 'asparagus', 'artichoke', 'beet',
      'radish', 'turnip', 'parsnip', 'fennel', 'okra',
      'basil', 'cilantro', 'parsley', 'dill', 'mint', 'sage',
      'tarragon', 'lemongrass', 'ginger', 'watercress', 'endive',
      'radicchio', 'vegetable', 'salad', 'greens', 'herb',
    ],
  },
  {
    category: 'Bakery',
    keywords: [
      'bread', 'bun', 'roll', 'tortilla', 'wrap', 'pita', 'naan',
      'flatbread', 'bagel', 'croissant', 'english muffin', 'baguette',
      'sourdough', 'ciabatta', 'crouton',
    ],
  },
  {
    category: 'Grains & Pasta',
    keywords: [
      'rice', 'pasta', 'noodle', 'spaghetti', 'penne', 'macaroni',
      'fusilli', 'linguine', 'fettuccine', 'ramen', 'udon', 'soba',
      'vermicelli', 'lasagna', 'oat', 'oatmeal', 'granola', 'cereal',
      'muesli', 'quinoa', 'couscous', 'barley', 'bulgur', 'farro',
      'millet', 'polenta', 'flour', 'cornmeal', 'breadcrumb', 'panko',
      'lentil', 'chickpea', 'bean', 'split pea',
    ],
  },
  {
    category: 'Frozen',
    keywords: ['frozen', 'ice cream', 'gelato', 'sorbet'],
  },
  {
    category: 'Snacks & Drinks',
    keywords: [
      'chip', 'cracker', 'pretzel', 'popcorn', 'trail mix',
      'granola bar', 'protein bar', 'nut', 'almond', 'walnut', 'cashew',
      'pecan', 'pistachio', 'peanut', 'macadamia', 'hazelnut', 'pine nut',
      'juice', 'soda', 'tea', 'coffee', 'espresso', 'wine', 'beer',
      'kombucha', 'sparkling water', 'seltzer', 'tonic',
    ],
  },
];

/**
 * Classify an ingredient name into a supermarket section.
 * Uses the ingredient NAME (not the recipe-provided category) for accuracy.
 */
export function classifyIngredient(name: string): string {
  const n = name.trim().toLowerCase();

  // 1) Frozen prefix always wins
  if (n.startsWith('frozen ')) return 'Frozen';

  // 2) Check specific overrides (compound/ambiguous names)
  //    Try longest match first so "plain greek yogurt" beats "yogurt".
  const overrideKeys = Object.keys(SPECIFIC_OVERRIDES).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of overrideKeys) {
    if (n === key || n.includes(key)) return SPECIFIC_OVERRIDES[key];
  }

  // 3) Keyword containment — first category with a matching keyword wins.
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    for (const kw of keywords) {
      if (wordMatch(n, kw)) return category;
    }
  }

  return 'Other';
}

// ── Display constants for the shopping screen ───────────────────────────────
export const SHOPPING_CATEGORIES = [
  'Vegetables & Herbs',
  'Fruits',
  'Meat & Poultry',
  'Seafood',
  'Dairy & Eggs',
  'Bakery',
  'Grains & Pasta',
  'Canned & Jarred',
  'Sauces & Oils',
  'Spices & Seasonings',
  'Frozen',
  'Snacks & Drinks',
  'Other',
];

export const CATEGORY_COLORS: Record<string, string> = {
  'Vegetables & Herbs': '#388E3C',
  'Fruits':             '#F57C00',
  'Meat & Poultry':     '#C62828',
  'Seafood':            '#0277BD',
  'Dairy & Eggs':       '#F9A825',
  'Bakery':             '#6D4C41',
  'Grains & Pasta':     '#8D6E63',
  'Canned & Jarred':    '#546E7A',
  'Sauces & Oils':      '#E64A19',
  'Spices & Seasonings': '#7B1FA2',
  'Frozen':             '#0288D1',
  'Snacks & Drinks':    '#2E7D32',
  'Other':              '#78909C',
};

// Maps old category values (from existing DB rows) to the new display names.
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  produce:    'Vegetables & Herbs',
  dairy:      'Dairy & Eggs',
  meat:       'Meat & Poultry',
  seafood:    'Seafood',
  bakery:     'Bakery',
  frozen:     'Frozen',
  canned:     'Canned & Jarred',
  dry_goods:  'Grains & Pasta',
  condiments: 'Sauces & Oils',
  beverages:  'Snacks & Drinks',
  snacks:     'Snacks & Drinks',
  other:      'Other',
};

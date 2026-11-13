
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: fileURLToPath(new URL('../.env.local', import.meta.url)),
});

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

const url = process.env.SERVER_URL;
const VOICE_MENU_API_SECRET = process.env.VOICE_MENU_API_SECRET;

type MenuVariant = {
  id: string;
  name: string;
  price: number;
  calories: number | null;
};

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price: number;
  image: string | null;
  calories: string | null;
  prepTime: string | null;
  variants: MenuVariant[];
  popular: boolean;
  spicy: boolean;
  aliases: string[];
  ingredients: string[];
};

if (!VOICE_MENU_API_SECRET || !url) {
  throw new Error('Missing API credentials');
}

let cache: {
  items: MenuItem[];
  at: number;
} | null = null;

// Fetch and cache the complete menu
export async function loadMenu(): Promise<MenuItem[]> {
  if (cache && Date.now() - cache.at < FIVE_MINUTES_IN_MS) {
    return cache.items;
  }

  try {
    const res = await fetch(`${url}/api/voice/menu`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${VOICE_MENU_API_SECRET}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Menu API returned status ${res.status}`);
    }

    const body: unknown = await res.json();

    if (
      typeof body !== 'object' ||
      body === null ||
      !('products' in body) ||
      !Array.isArray(body.products)
    ) {
      throw new Error('Invalid menu API response');
    }

    // Type assertion only; runtime validation can be added later.
    const products = body.products as MenuItem[];

    cache = {
      items: products,
      at: Date.now(),
    };

    return products;
  } catch (error) {
    console.error('Failed to load menu:', error);

    throw new Error("Menu couldn't be retrieved", {
      cause: error,
    });
  }
}

// Count products by category
export function groupOverview(items: MenuItem[]): string {
  const counts: Record<string, number> = {};

  for (const item of items) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([category, count]) => `${category} (${count})`)
    .join(', ');
}

// Get available categories
export function getMenuCategories(items: MenuItem[]): string[] {
  return [...new Set(items.map((item) => item.category))];
}

// Search all matching products — no default result limit
export function search(
  items: MenuItem[],
  query: string,
): MenuItem[] {
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) return [];

  return items.filter((item) => {
    return (
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.category.toLowerCase().includes(normalizedQuery) ||
      item.description?.toLowerCase().includes(normalizedQuery) ||
      item.aliases.some((alias) =>
        alias.toLowerCase().includes(normalizedQuery),
      ) ||
      item.ingredients.some((ingredient) =>
        ingredient.toLowerCase().includes(normalizedQuery),
      )
    );
  });
}

// Lightweight product information for browsing
export function menuSummary(items: MenuItem[]): string {
  return items
    .map((item) => {
      const variants = item.variants
        .map((variant) => `${variant.name}: ${variant.price} EGP`)
        .join(', ');

      return [
        `${item.name} — ${item.price} EGP`,
        `Variants: ${variants || 'Not available'}`,
      ].join('\n');
    })
    .join('\n\n');
}

// Full information for a specific product
export function productDetails(item: MenuItem): string {
  const variants = item.variants
    .map(
      (variant) =>
        `${variant.name}: ${variant.price} EGP, ${
          variant.calories !== null
            ? `${variant.calories} kcal`
            : 'calories not available'
        }`,
    )
    .join('\n');

  return [
    `Name: ${item.name}`,
    `Category: ${item.category}`,
    `Price: ${item.price} EGP`,
    `Description: ${item.description ?? 'Not available'}`,
    `Ingredients: ${
      item.ingredients.length
        ? item.ingredients.join(', ')
        : 'Not available'
    }`,
    `Preparation time: ${item.prepTime ?? 'Not available'}`,
    `Spicy: ${item.spicy ? 'Yes' : 'No'}`,
    `Popular: ${item.popular ? 'Yes' : 'No'}`,
    `Variants:\n${variants || 'Not available'}`,
  ].join('\n');
}

// Find one product by name or alias
export function findProduct(
  items: MenuItem[],
  query: string,
): MenuItem[] {
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) return [];

  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.aliases.some((alias) =>
        alias.toLowerCase().includes(normalizedQuery),
      ),
  );
}

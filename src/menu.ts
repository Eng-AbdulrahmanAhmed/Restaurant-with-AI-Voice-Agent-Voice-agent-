import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: fileURLToPath(new URL('../.env.local', import.meta.url)),
});

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

const url = process.env.SERVER_URL;
const VOICE_MENU_API_SECRET = process.env.VOICE_MENU_API_SECRET;

// Menu types
type MenuVariant = {
  id: string;
  name: string;
  price: number;
  calories: number | null; // Add this
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

// Check environment variables
if (!VOICE_MENU_API_SECRET || !url) {
  throw new Error('Missing API credentials');
}

// Menu cache
let cache: {
  items: MenuItem[];
  at: number;
} | null = null;

// Fetch menu from Next.js API
export async function loadMenu(): Promise<MenuItem[]> {
  // 1. Return cached menu if valid
  if (cache && Date.now() - cache.at < FIVE_MINUTES_IN_MS) {
    return cache.items;
  }

  try {
    // 2. Request menu from Next.js API
    const res = await fetch(`${url}/api/voice/menu`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${VOICE_MENU_API_SECRET}`,
      },
    });

    // 3. Check HTTP status
    if (!res.ok) {
      throw new Error(`Menu API returned status ${res.status}`);
    }

    // 4. Parse JSON response
    const body: unknown = await res.json();

    // 5. Check response structure
    if (
      typeof body !== 'object' ||
      body === null ||
      !('products' in body) ||
      !Array.isArray(body.products)
    ) {
      throw new Error('Invalid menu API response');
    }

    // 6. Assign products
    // This is a TypeScript assertion, not full runtime validation.
    const products = body.products as MenuItem[];

    // 7. Update cache
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

// Search products
export function search(items: MenuItem[], query: string, limit = 5): MenuItem[] {
  const menuItems: MenuItem[] = [];
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) return [];

  for (const item of items) {
    if (
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.category.toLowerCase().includes(normalizedQuery) ||
      item.description?.toLowerCase().includes(normalizedQuery) ||
      item.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery)) ||
      item.ingredients.some((ingredient) => ingredient.toLowerCase().includes(normalizedQuery))
    ) {
      menuItems.push(item);
    }
  }

  return menuItems.slice(0, limit);
}

// Format products into detailed readable text
export function itemLines(items: MenuItem[], limit = 8): string {
  return items
    .slice(0, limit)
    .map((item) => {
      const variants = item.variants
        .map(
          (variant) =>
            `${variant.name} (${variant.price} EGP, ${
              variant.calories !== null ? `${variant.calories} kcal` : 'calories not available'
            })`,
        )
        .join(', ');

      return [
        `${item.name} — ${item.price} EGP`,
        `Description: ${item.description ?? 'Not available'}`,
        `Preparation time: ${item.prepTime ?? 'Not available'}`,
        `Spicy: ${item.spicy ? 'Yes' : 'No'}`,
        `Variants: ${variants || 'None'}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function getMenuCategories(items: MenuItem[]): string[] {
  return [...new Set(items.map((item) => item.category))];
}

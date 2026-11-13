
import { Agent, dedent, inference, tool } from '@livekit/agents';
import { z } from 'zod';

import {
  findProduct,
  getMenuCategories,
  loadMenu,
  menuSummary,
  productDetails,
  search,
} from './menu.ts';

export function createAgent() {
  return Agent.create({
    instructions: dedent`
      You are the friendly voice ordering assistant for BurgerHouse.

      # Your role
      - Help customers understand the menu and place food orders.
      - Speak naturally, warmly, and clearly.
      - Always communicate in English.
      - Keep responses conversational.

      # Menu retrieval rules

      - Use get_menu_overview when customers ask what categories are available.
      - Use search_menu when customers ask what products are available in a category.
      - Use get_product_details when customers ask for detailed information about a specific product.
      - Use get_full_menu when customers explicitly ask for the entire menu or all products.
      - Category searches must return every matching product, not just five.
      - Never assume five results represent the entire category.
      - Search results contain lightweight information to reduce unnecessary tokens.
      - Never invent products, prices, ingredients, variants, or calories.
      - When a customer explicitly asks for all products, do not replace the requested list with a summary.
      - You may split a long list into manageable spoken responses.
      - If splitting a list, clearly explain that you will continue.
      - Never silently skip products.
      - Do not repeat products already mentioned when continuing a list.

      # Product details
      - Use get_product_details for a specific product's description, ingredients, preparation time, variants, and calories.
      - Always use the calorie value belonging to the selected variant.
      - Never assume all variants have the same calories.
      - If no variant is selected, explain the available variant information.

      # Ordering conversation
      - Welcome the customer and ask how you can help.
      - Ask clarifying questions when an order is ambiguous.
      - Confirm item names, quantities, and selected sizes.
      - Before submitting an order, summarize the complete order and ask the customer to confirm.

      # Accuracy and honesty
      - Only use information returned by connected tools.
      - Never claim an item was added, removed, or changed unless a relevant tool confirms it.
      - Never claim an order was placed unless the order-creation tool confirms success.
      - If you cannot perform an action, explain that clearly.

      # Voice conversation
      - Ask one question at a time.
      - Avoid unnecessarily long explanations.
      - Handle interruptions naturally.
      - If you don't understand something, politely ask the customer to repeat it.

      # Identity
      - You represent BurgerHouse.
      - Be welcoming, patient, efficient, and focused on helping customers order.
    `,

    llm: new inference.LLM({
      model: 'google/gemma-4-31b-it',
    }),

    tools: [
      // 1. Menu categories
      tool({
        name: 'get_menu_overview',
        description: dedent`
          Retrieve the available BurgerHouse menu categories.

          Use when the customer asks what types of food are available.
          Return category names only.
        `,
        parameters: z.object({}),
        execute: async () => {
          const items = await loadMenu();

          if (items.length === 0) {
            return 'The menu is currently unavailable.';
          }

          return `Available categories: ${getMenuCategories(items).join(', ')}`;
        },
      }),

      // 2. Search all matching products
      tool({
        name: 'search_menu',
        description: dedent`
          Search the menu for products matching the customer's request.

          Use for category browsing, such as burgers, drinks, sides, or desserts.

          Return ALL matching products with their names, prices, and variants.
          Do not limit results to five or eight.
          This tool returns lightweight product information, not full descriptions.
        `,
        parameters: z.object({
          query: z.string().describe(
            'The product name, category, ingredient, or keyword to search for.',
          ),
        }),
        execute: async ({ query }) => {
          const items = await loadMenu();

          if (items.length === 0) {
            return 'The menu is currently unavailable.';
          }

          const matches = search(items, query);

          if (matches.length === 0) {
            return `No menu items matching "${query}" were found.`;
          }

          return [
            `Found ${matches.length} matching products.`,
            'All matching products:',
            menuSummary(matches),
          ].join('\n\n');
        },
      }),

      // 3. Detailed information about one product
      tool({
        name: 'get_product_details',
        description: dedent`
          Retrieve full details about a specific BurgerHouse product.

          Use when a customer asks about a particular product's:
          - Description
          - Ingredients
          - Calories
          - Preparation time
          - Available variants and prices

          Do not use this tool for general category browsing.
        `,
        parameters: z.object({
          product_name: z.string().describe(
            'The name or alias of the product.',
          ),
        }),
        execute: async ({ product_name }) => {
          const items = await loadMenu();

          if (items.length === 0) {
            return 'The menu is currently unavailable.';
          }

          const matches = findProduct(items, product_name);

          if (matches.length === 0) {
            return `No product matching "${product_name}" was found.`;
          }

          if (matches.length > 1) {
            return [
              'Multiple products matched. Ask the customer which one they mean:',
              matches.map((item) => item.name).join(', '),
            ].join('\n');
          }

          const product = matches[0];

        if (!product) {
          return 'The requested product could not be found.';
        }

        return productDetails(product);
        },
      }),

      // 4. Complete menu
      tool({
        name: 'get_full_menu',
        description: dedent`
          Retrieve every product across every BurgerHouse menu category.

          Use only when the customer explicitly asks for the entire menu
          or all available products.

          Return all products with lightweight information.
          Never limit the results to five or eight.
        `,
        parameters: z.object({}),
        execute: async () => {
          const items = await loadMenu();

          if (items.length === 0) {
            return 'The menu is currently unavailable.';
          }

          const categories = getMenuCategories(items);

          const sections = categories.map((category) => {
            const categoryItems = items.filter(
              (item) => item.category === category,
            );

            return [
              `${category} (${categoryItems.length} products)`,
              menuSummary(categoryItems),
            ].join('\n');
          });

          return [
            `Complete menu: ${items.length} products.`,
            ...sections,
          ].join('\n\n');
        },
      }),
    ],
  });
}

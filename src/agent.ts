import { Agent, dedent, getJobContext, inference, tool } from '@livekit/agents';
import { z } from 'zod';
import { findProduct, getMenuCategories, loadMenu, menuSummary, productDetails } from './menu.ts';

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

      # Cart retrieval rules
      - Whenever the customer asks a question that depends on the current cart, ALWAYS call get_cart first.
      - This includes questions about cart contents, quantities, prices, totals, and order summaries.
      - Never answer cart-related questions using previously retrieved cart data.
      - Always use the latest response from get_cart as the source of truth.
      - Even if get_cart was called earlier in the conversation, call it again when answering a new cart-related question.
      - Never assume the cart has remained unchanged since the previous retrieval.
      - Never calculate, estimate, or modify the cart total yourself. Use the total and currency supplied by get_cart.

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
          query: z
            .string()
            .describe('The product name, category, ingredient, or keyword to search for.'),
        }),
        // execute: async ({ query }) => {
        //   const items = await loadMenu();

        //   if (items.length === 0) {
        //     return 'The menu is currently unavailable.';
        //   }

        //   const matches = search(items, query);

        //   if (matches.length === 0) {
        //     return `No menu items matching "${query}" were found.`;
        //   }

        //   return [
        //     `Found ${matches.length} matching products.`,
        //     'All matching products:',
        //     menuSummary(matches),
        //   ].join('\n\n');
        // },
        execute: async ({ query }) => {
          const room = getJobContext().room;

          const participant = Array.from(room.remoteParticipants.values()).find((participant) =>
            participant.identity.startsWith('guest-'),
          );

          if (!participant) {
            return 'Could not connect to the browser.';
          }

          if (!room.localParticipant) {
            return 'Could not connect to the browser.';
          }

          const response = await room.localParticipant.performRpc({
            destinationIdentity: participant.identity,
            method: 'searchMenu',
            payload: JSON.stringify({ query }),
            responseTimeout: 5000,
          });

          return response;
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
          product_name: z.string().describe('The name or alias of the product.'),
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
            const categoryItems = items.filter((item) => item.category === category);

            return [
              `${category} (${categoryItems.length} products)`,
              menuSummary(categoryItems),
            ].join('\n');
          });

          return [`Complete menu: ${items.length} products.`, ...sections].join('\n\n');
        },
      }),

      // 5. Current cart
      tool({
        name: 'get_cart',
        description: dedent`
          Retrieve the customer's current cart, including all items and the
          frontend-calculated total.

          Use whenever the customer asks about their current cart,
          including its contents, quantities, prices, or total.

          The response contains:
          - items: all cart items and their quantities.
          - total: the final total calculated by the frontend.
          - currency: the currency used for that total.

          IMPORTANT:
          - Always use the supplied total and currency when answering
            questions about the cart total.
          - Never calculate, estimate, or modify the total yourself.
          - Never calculate the total by adding item prices.
          - Never rely on a previous cart response. Fetch the current cart again.
        `,
        parameters: z.object({}),
        execute: async () => {
          const room = getJobContext().room;

          const participant = Array.from(room.remoteParticipants.values()).find((participant) =>
            participant.identity.startsWith('guest-'),
          );

          if (!participant) {
            return 'I could not connect to your cart. Please try again.';
          }

          if (!room.localParticipant) {
            return 'I could not connect to your cart. Please try again.';
          }

          const response = await room.localParticipant.performRpc({
            destinationIdentity: participant.identity,
            method: 'getCart',
            payload: JSON.stringify({}),
            responseTimeout: 5000,
          });

          const cart = JSON.parse(response);

          if (cart.items.length === 0) {
            return 'The shopping cart is currently empty.';
          }

          return cart;
        },
      }),

      // 6. Add product to cart
      tool({
        name: 'add_to_cart',
        description: dedent`
          Add a product to the customer's shopping cart.

          Use when the customer wants to add a product.

          You must provide:
          - The exact product ID.
          - The exact variant ID for the selected size.
          - The quantity (defaults to 1).

          Never guess product IDs or variant IDs.
          Get them from the menu search results.
          Make sure the product and size are clear before calling this tool.
        `,
        parameters: z.object({
          productId: z.string().describe('The exact product ID.'),
          variantId: z.string().describe('The exact selected variant ID.'),
          quantity: z.number().int().positive().default(1).describe('The quantity to add.'),
        }),
        execute: async ({ productId, variantId, quantity }) => {
          const room = getJobContext().room;

          const participant = Array.from(room.remoteParticipants.values()).find((participant) =>
            participant.identity.startsWith('guest-'),
          );

          if (!participant || !room.localParticipant) {
            return 'Could not connect to the browser. Please try again.';
          }

          const response = await room.localParticipant.performRpc({
            destinationIdentity: participant.identity,
            method: 'addToCart',
            payload: JSON.stringify({
              productId,
              variantId,
              quantity,
            }),
            responseTimeout: 5000,
          });

          const result = JSON.parse(response);

          return result.message;
        },
      }),
    ],
  });
}

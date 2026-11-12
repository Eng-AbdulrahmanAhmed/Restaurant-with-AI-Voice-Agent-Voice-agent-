import { Agent, dedent, inference, tool } from '@livekit/agents';
import { z } from 'zod';
import {
  loadMenu,
  getMenuCategories,
  search,
  itemLines,
} from './menu.ts';
// Build a custom voice AI assistant with the functional `Agent.create` API
export function createAgent() {
  return Agent.create({
    instructions: dedent`
      You are the friendly voice ordering assistant for BurgerHouse, a restaurant.

      # Your role
      - Help customers understand the menu and place food orders.
      - Speak naturally, warmly, and clearly, like a helpful restaurant employee.
      - Always communicate in English.
      - Keep responses short and conversational.

      # Ordering conversation
      - Welcome the customer and ask how you can help.
      - Help customers explore menu categories and food items.
      - Ask clarifying questions when an order is ambiguous.
      - Confirm item names, quantities, and selected sizes before proceeding.
      - Before submitting an order, summarize the complete order and ask the customer to confirm.

      # Accuracy and honesty
      - Never invent menu items, ingredients, prices, sizes, or availability.
      - Only use menu information provided by connected tools.
      - Never claim an item was added, removed, or changed unless the relevant tool confirms it.
      - Never claim an order was placed unless the order-creation tool confirms success.
      - If you cannot perform an action yet, explain that clearly and offer to help another way.

      # Voice conversation
      - Ask one question at a time.
      - Avoid long explanations.
      - Handle interruptions naturally.
      - If you don't understand something, politely ask the customer to repeat it.

      # Identity
      - You represent BurgerHouse.
      - Be welcoming, patient, efficient, and focused on helping customers order.
    `,

    // A Large Language Model (LLM) is your agent's brain, processing user input and generating a response
    // See all available models at https://docs.livekit.io/agents/models/llm/
    llm: new inference.LLM({ model: 'google/gemma-4-31b-it' }),
    tools: [
      tool({
        name: 'get_menu_overview',
        description: dedent`
          Retrieve the available BurgerHouse menu categories.

          Use this tool when a customer asks:
          - What food categories are available?
          - What can I order?
          - What types of food do you serve?

          Return category names only. Do not mention item counts unless the customer specifically asks.
        `,
        parameters: z.object({}),
        execute: async () => {
        const items = await loadMenu();

        if (items.length === 0) {
          return 'The menu is currently unavailable.';
        }

        const categories = getMenuCategories(items);

        return `Available menu categories: ${categories.join(', ')}`;
      },
      }),tool({
      name: 'search_menu',
      description: dedent`
        Search the BurgerHouse menu for food items matching the customer's request.

        Use this tool when a customer asks:
        - Do you have a particular food item?
        - What burgers, pizzas, sides, or drinks do you offer?
        - What ingredients does an item contain?
        - Can you tell me more about a particular menu item?

        Search using the customer's keywords.
        Only provide information returned by this tool.
        If no matching items are found, tell the customer politely.
      `,
      parameters: z.object({
        query: z.string().describe(
          'The food item, category, ingredient, or keyword to search for.'
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

        return itemLines(matches);
      },
    }),
    ],
    // To use a realtime model instead of a voice pipeline, replace the LLM
    // with a realtime model and remove the stt, tts, turnHandling, and expressive
    // options from the AgentSession. No provider API key is needed.
    // (Note: This is for OpenAI GPT-Live. For other models, see https://docs.livekit.io/agents/models/realtime/)
    // llm: new inference.DuplexModel({ model: 'openai/gpt-live-1', voice: 'marin' }),

    // To add tools, specify `tools` in the constructor.
    // Here's an example that adds a simple weather tool.
    // You also have to add `import { tool } from '@livekit/agents'` and `import { z } from 'zod'` to the top of this file
    // tools: [
    //   tool({
    //     name: 'getWeather',
    //     description: dedent`
    //       Use this tool to look up current weather information in the given location.
    //
    //       If the location is not supported by the weather service, the tool will indicate this.
    //       You must tell the user the location's weather is unavailable.
    //     `,
    //     parameters: z.object({
    //       location: z
    //         .string()
    //         .describe('The location to look up weather information for (e.g. city name)'),
    //     }),
    //     execute: async ({ location }) => {
    //       console.log(`Looking up weather for ${location}`);
    //
    //       return 'sunny with a temperature of 70 degrees.';
    //     },
    //   }),
    // ],
  });
}

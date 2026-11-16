
import {
  ServerOptions,
  cli,
  defineAgent,
  inference,
  voice,
} from '@livekit/agents';

import {
  EnhancerModel,
  audioEnhancement,
} from '@livekit/plugins-ai-coustics';

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createAgent } from './agent.ts';

// Load environment variables
dotenv.config({ path: '.env.local' });

export default defineAgent({
  entry: async (ctx) => {
    // Set up the voice AI pipeline
    const session = new voice.AgentSession({
      // Speech-to-text
      stt: new inference.STT({
        model: 'assemblyai/universal-3-6-pro',
        language: 'en',
      }),

      // Speech recognition keyterms
      keytermsOptions: {
        keyterms: ['LiveKit', 'BurgerHouse'],
        keytermDetection: { enabled: true },
      },

      // Text-to-speech
      tts: new inference.TTS({
        model: 'fishaudio/s2.1-pro',
        voice: 'fa4c9eb3dccc4806b382b40d61c6b10a',
      }),

      // Turn handling
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
        preemptiveGeneration: { enabled: true },
      },

      // Expressive speech
      expressive: true,
    });

    // Start the session
    await session.start({
      agent: createAgent(),
      room: ctx.room,
      inputOptions: {
        noiseCancellation: audioEnhancement({
          model: EnhancerModel.QuailVfS,
        }),
      },
    });

    // Greet the customer
    session.generateReply({
      instructions:
        'Enthusiastically greet the user and offer to help.',
    });
  },
});

// Run the agent server
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'my-agent',
  }),
);

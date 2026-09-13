import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';

/**
 * Amplify wiring.
 *
 * `amplify_outputs.json` is written by `ampx sandbox` / `ampx pipeline-deploy`.
 * It is NOT in the repo — until it exists the app stays in demo mode, exactly
 * as it did without Supabase credentials, so `npm start` works for anyone who
 * clones this.
 */
let configured = false;
let outputs: unknown = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  outputs = require('../amplify_outputs.json');
} catch {
  outputs = null;
}

export const DEMO_MODE = !outputs;

if (outputs && !configured) {
  Amplify.configure(outputs as Parameters<typeof Amplify.configure>[0]);
  configured = true;
}

/**
 * Typed data client. Co-hosts can only reach the custom queries — the models
 * themselves are locked to leadership by the authorization rules in
 * amplify/data/resource.ts. Calling client.models.PrayerRequest.list() as a
 * co-host does not return an empty list; it is denied.
 */
export const client = DEMO_MODE
  ? (null as unknown as ReturnType<typeof generateClient<Schema>>)
  : generateClient<Schema>();

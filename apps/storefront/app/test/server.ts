import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * Node-side MSW server for jsdom tests. Started from app/test/setup.ts and
 * reset between tests, so each test starts from a clean session and call
 * counts.
 */
export const server = setupServer(...handlers);

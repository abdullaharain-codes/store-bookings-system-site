import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { checkoutHandlers } from "./handlers-checkout";
import { wishlistHandlers } from "./handlers-wishlist";

/**
 * Node-side MSW server for jsdom tests. Started from app/test/setup.ts and
 * reset between tests, so each test starts from a clean session and call
 * counts.
 *
 * The address/order handlers live in handlers-checkout.ts rather than the
 * shared handlers.ts: they import fixtures/accessors FROM ./handlers (never the
 * other way round), so registering both here keeps the 1185-line shared file
 * free of order/address fixtures while still serving the real wire contract.
 */
export const server = setupServer(
  ...handlers,
  ...checkoutHandlers,
  ...wishlistHandlers
);

/**
 * Every request the server saw, as "METHOD /path" in call order. A test uses
 * this as wire evidence that a component made no request it should not have.
 * MSW 2.x exposes `request:start` (there is no plain `request` event).
 */
export const recordedRequests: string[] = [];

server.events.on("request:start", ({ request }) => {
  recordedRequests.push(`${request.method} ${new URL(request.url).pathname}`);
});

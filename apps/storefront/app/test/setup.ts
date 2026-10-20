import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";
import {
  callCounts,
  productDetailRequests,
  productRequests,
  reviewShowcaseRequests,
  serviceDetailRequests,
  servicesListRequests,
  session,
  setCartItemsSource,
  setCartUpdateError,
  setProductDetailSource,
  setProductsSource,
  setServicesListSource,
  setShippingFeeSource,
  testCartItems,
  testProductDetails,
  testProducts,
  testShippingFee,
} from "./handlers";

configure({ asyncUtilTimeout: 3000 });

beforeAll(() => {
  // "error" (not "warn"): a request a handler does not cover is a test bug, not
  // a network condition to shrug at. Real calls must never escape jsdom.
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  session.end();
  callCounts.reset();
  // Recorded query params and the swappable product pool are per-test evidence;
  // keeping either would let one test read another test's fixtures.
  setProductsSource(testProducts);
  productRequests.length = 0;
  reviewShowcaseRequests.length = 0;
  setProductDetailSource(testProductDetails);
  productDetailRequests.length = 0;
  setCartItemsSource(testCartItems);
  setCartUpdateError(null);
  // The service list pool defaults to empty (Home keeps omitting the row); the
  // detail recorder is per-test evidence like the product one.
  setServicesListSource([]);
  servicesListRequests.length = 0;
  serviceDetailRequests.length = 0;
  setShippingFeeSource(testShippingFee);
});

afterAll(() => {
  server.close();
});

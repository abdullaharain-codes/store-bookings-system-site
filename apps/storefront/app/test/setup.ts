import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";
import {
  callCounts,
  cartPatchBodies,
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
  testUser,
} from "./handlers";
import {
  resetCancelOrderDelay,
  resetLastPlaceOrderBody,
  resetPlaceOrderDelay,
  setAddressesSource,
  setCancelOrderError,
  setOrdersSource,
  setPlaceOrderError,
  testAddresses,
} from "./handlers-checkout";
import { setWishlistError, setWishlistSource } from "./handlers-wishlist";
import { resetProfileUpdateTracking, setAddressesSourceAccount, setPasswordChangeError, setProfileDelay, setProfileSource } from "./handlers-account";
import { resetBookingsSource, setBookingCancelCutoffError, setBookingConflictError } from "./handlers-bookings";
import { recordedRequests } from "./server";

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
  // The order/address fixtures are per-test too: a placed order empties the
  // cart source and appends to the order pool, so both must reset or the next
  // test inherits another test's mutations.
  setAddressesSource(testAddresses);
  setOrdersSource([]);
  setPlaceOrderError(null);
  resetLastPlaceOrderBody();
  resetPlaceOrderDelay();
  setCancelOrderError(null);
  resetCancelOrderDelay();
  // The wishlist is per-test: a toggle mutates the pool, so the next test must
  // start from an empty wishlist and no forced error.
  setWishlistSource([]);
  setWishlistError(null);
  cartPatchBodies.length = 0;
  recordedRequests.length = 0;
  setProfileSource(testUser);
  setPasswordChangeError(null);
  setProfileDelay(0);
  resetProfileUpdateTracking();
  setAddressesSourceAccount(testAddresses);
  resetBookingsSource();
  setBookingConflictError(false);
  setBookingCancelCutoffError(false);
});

afterAll(() => {
  server.close();
});

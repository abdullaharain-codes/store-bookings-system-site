export { default as apiClient } from "./api-client";
export {
  getCategories,
  getBrands,
  getProducts,
  type Category,
  type Brand,
  type Product,
  type ProductImage,
  type Asset,
  type CategoriesResponse,
  type BrandsResponse,
  type ProductsResponse,
} from "./catalog";
export {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  type Cart,
  type CartItem,
  type CartResponse,
  type CartItemResponse,
} from "./cart";
export {
  getAddresses,
  createAddress,
  type Address,
  type CreateAddressData,
  type AddressesResponse,
  type AddressResponse,
} from "./address";
export {
  placeOrder,
  listOrders,
  getOrder,
  cancelOrder,
  type Order,
  type OrderItem,
  type OrderResponse,
  type OrdersResponse,
} from "./order";
export {
  getServices,
  getServiceBySlug,
  type Service,
  type ServicesResponse,
} from "./services";
export { useAuthStore, type User } from "./stores/auth-store";
export { usePendingActionStore } from "./stores/pending-action-store";
export { useRedirectAndResume } from "./hooks/use-redirect-and-resume";

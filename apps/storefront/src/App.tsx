import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuthStore } from "@ecommerce/api-client";
import LoginPage from "./pages/Login";
// Throwaway Phase-3 verification page — replaces the placeholder Home until
// the real storefront UI is built from the design-reference prototype.
import HomePage from "./pages/Home";
// Throwaway Phase-4/5 verification page — Cart → Checkout → Order flow.
import FlowVerifyPage from "./pages/FlowVerify";

export default function StorefrontApp() {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify" element={<FlowVerifyPage />} />
      </Routes>
    </BrowserRouter>
  );
}

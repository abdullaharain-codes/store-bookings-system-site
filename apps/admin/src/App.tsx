import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Button, Card, Badge } from "@ecommerce/ui";
import { useAuthStore } from "@ecommerce/api-client";
import LoginPage from "./pages/Login";

function DashboardPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-muted)]">
      <header className="bg-[var(--color-surface-dark)] p-4">
        <h1 className="text-xl font-bold text-[var(--color-text-inverse)]">Admin Panel</h1>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Card className="mb-6">
          <h2 className="text-lg font-bold">Dashboard</h2>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            Manage your store from here.
          </p>
        </Card>
        <div className="flex gap-4">
          <Button variant="primary">Manage Products</Button>
          <Badge variant="info">Admin</Badge>
        </div>
        <a href="/login" className="mt-6 block text-[var(--color-brand-accent)] underline">
          Sign In
        </a>
      </main>
    </div>
  );
}

export default function AdminApp() {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { loadAuth } from './lib/auth';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProductsPage from './pages/ProductsPage';
import OrdersPage from './pages/OrdersPage';
import CatalogPage from './pages/CatalogPage';
import ImportPage from './pages/ImportPage';
import BlockedUsersPage from './pages/BlockedUsersPage';
import CouponsPage from './pages/CouponsPage';

function Guard({ children }) {
  const { token } = loadAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={(
            <Guard>
              <Dashboard />
            </Guard>
          )}
        />
        <Route
          path="/import"
          element={(
            <Guard>
              <ImportPage />
            </Guard>
          )}
        />
        <Route
          path="/products"
          element={(
            <Guard>
              <ProductsPage />
            </Guard>
          )}
        />
        <Route
          path="/orders"
          element={(
            <Guard>
              <OrdersPage />
            </Guard>
          )}
        />
        <Route
          path="/catalog"
          element={(
            <Guard>
              <CatalogPage />
            </Guard>
          )}
        />
        <Route
          path="/users"
          element={(
            <Guard>
              <BlockedUsersPage />
            </Guard>
          )}
        />
        <Route
          path="/coupons"
          element={(
            <Guard>
              <CouponsPage />
            </Guard>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

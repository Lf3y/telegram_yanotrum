import { useCallback, useState } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { CartProvider } from './store/cart';
import { FavoritesProvider } from './hooks/useFavorites';
import AppLayout from './components/AppLayout';
import { SplashScreen } from './components/SplashScreen';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import Profile from './pages/Profile';
import Lounge from './pages/Lounge';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  const finishSplash = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <CartProvider>
      <FavoritesProvider>
        {showSplash && <SplashScreen onFinish={finishSplash} />}
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/catalog/:slug" element={<Catalog />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/lounge" element={<Lounge />} />
              <Route path="/favorites" element={<Navigate to="/profile?tab=favorites" replace />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/orders" element={<Navigate to="/profile?tab=orders" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </FavoritesProvider>
    </CartProvider>
  );
}

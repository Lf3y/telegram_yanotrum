import { useCallback, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CartProvider } from './store/cart';
import { FavoritesProvider } from './hooks/useFavorites';
import AppLayout from './components/AppLayout';
import { SplashScreen, shouldShowIntroSplash } from './components/SplashScreen';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import Orders from './pages/Orders';
import Assistant from './pages/Assistant';
import Favorites from './pages/Favorites';

export default function App() {
  const [showSplash, setShowSplash] = useState(shouldShowIntroSplash);

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
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/assistant" element={<Assistant />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </FavoritesProvider>
    </CartProvider>
  );
}

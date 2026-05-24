import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './store/cart';
import { FavoritesProvider } from './hooks/useFavorites';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import Orders from './pages/Orders';
import Assistant from './pages/Assistant';
import Favorites from './pages/Favorites';

export default function App() {
  return (
    <CartProvider>
      <FavoritesProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<><Home /><BottomNav /></>} />
            <Route path="/catalog" element={<><Catalog /><BottomNav /></>} />
            <Route path="/catalog/:slug" element={<><Catalog /><BottomNav /></>} />
            <Route path="/favorites" element={<><Favorites /><BottomNav /></>} />
            <Route path="/cart" element={<><Cart /><BottomNav /></>} />
            <Route path="/orders" element={<><Orders /><BottomNav /></>} />
            <Route path="/assistant" element={<><Assistant /><BottomNav /></>} />
          </Routes>
        </BrowserRouter>
      </FavoritesProvider>
    </CartProvider>
  );
}

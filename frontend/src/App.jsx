import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './store/cart';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import Cart from './pages/Cart';
import Orders from './pages/Orders';

export default function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<><Home /><BottomNav /></>} />
          <Route path="/catalog" element={<><Catalog /><BottomNav /></>} />
          <Route path="/catalog/:slug" element={<><Catalog /><BottomNav /></>} />
          <Route path="/cart" element={<><Cart /><BottomNav /></>} />
          <Route path="/orders" element={<><Orders /><BottomNav /></>} />
        </Routes>
      </BrowserRouter>
    </CartProvider>
  );
}

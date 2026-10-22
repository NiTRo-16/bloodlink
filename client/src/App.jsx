import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import BottomNav from './components/BottomNav.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewRequest from './pages/NewRequest.jsx';
import RequestDetail from './pages/RequestDetail.jsx';

// Each page opens at the top, as it would in a native app, instead of keeping the last page's scroll position.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    // On phones, bottom padding keeps the last content above the tab bar and the home indicator.
    <div className="flex min-h-screen flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <ScrollToTop />
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/requests/new" element={<RequireAuth><NewRequest /></RequireAuth>} />
          <Route path="/requests/:id" element={<RequireAuth><RequestDetail /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4">
        <div className="flex flex-wrap justify-between gap-2 border-t-3 border-ink py-5 text-sm font-semibold">
          <span>BloodLink connects donors and families. The blood bank makes the final medical decision.</span>
          <a href="tel:108" className="font-extrabold hover:underline">Emergency? Call 108</a>
        </div>
      </footer>
      <BottomNav />
    </div>
  );
}

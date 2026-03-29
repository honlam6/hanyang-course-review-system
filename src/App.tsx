import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import UserView from './components/UserView';
import AdminDashboard from './components/AdminDashboard';
import AnnouncementModal from './components/AnnouncementModal';
import { Analytics } from '@vercel/analytics/react';
import { useEffect, useState } from 'react';
import { CAMPUS_STORAGE_KEY, CampusCode } from './constants/campus';

function SecurityDeterrents() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable F12
      if (e.key === 'F12') {
        e.preventDefault();
      }
      // Disable Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) {
        e.preventDefault();
      }
      // Disable Ctrl+U (View Source)
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      // If the user tries to copy, we can prevent it or clear the clipboard
      // For now, let's just prevent it globally if it's not the admin dashboard
      if (!window.location.pathname.includes('/admin')) {
        e.preventDefault();
        // Optional: show a toast or alert
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('copy', handleCopy);
    };
  }, []);

  return null;
}

function AppShell() {
  const location = useLocation();
  const isAdminRoute = location.pathname === '/admin' || location.pathname === '/honlam666';
  const [selectedCampus, setSelectedCampus] = useState<CampusCode | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem(CAMPUS_STORAGE_KEY);
    return saved === 's' || saved === 'e' ? saved : null;
  });

  useEffect(() => {
    if (!selectedCampus) return;
    localStorage.setItem(CAMPUS_STORAGE_KEY, selectedCampus);
  }, [selectedCampus]);

  return (
    <div className="relative">
      <SecurityDeterrents />
      {!isAdminRoute && (
        <AnnouncementModal
          selectedCampus={selectedCampus}
          onCampusChange={setSelectedCampus}
        />
      )}
      <Routes>
        <Route
          path="/"
          element={
            <UserView
              selectedCampus={selectedCampus}
              onCampusChange={setSelectedCampus}
            />
          }
        />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/honlam666" element={<Navigate to="/admin" replace />} />
      </Routes>
      <Analytics />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

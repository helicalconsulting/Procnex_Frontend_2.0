import { useEffect, useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { sseClient } from '../../services/sseClient';
import { useBranding } from '../../context/BrandingContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ToastContainer from '../shared/ToastContainer';
import './AppLayout.css';

export default function AppLayout() {
  const { companyName, supportEmail } = useBranding();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleCollapse = useCallback(() => {
    setCollapsed(true);
  }, []);

  const handleMobileOpen = useCallback(() => {
    setMobileOpen(true);
  }, []);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);

  // Centralize SSE connection — stays connected for the entire authenticated session
  useEffect(() => {
    sseClient.connect();
    return () => {
      sseClient.disconnect();
    };
  }, []);

  return (
    <div
      className={`app-layout ${collapsed ? 'app-layout--collapsed' : ''}`}
    >
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapse={handleCollapse}
        onMobileClose={handleMobileClose}
      />

      <div className="app-layout__main">
        <TopBar onMenuClick={handleMobileOpen} />
        <div className="app-layout__body">
          <main className="app-layout__content">
            <Outlet />
          </main>
          <ToastContainer />
          <footer className="app-layout__footer">
            © {new Date().getFullYear()} {supportEmail ? `${companyName} · ${supportEmail}` : companyName}
          </footer>
        </div>
      </div>
    </div>
  );
}

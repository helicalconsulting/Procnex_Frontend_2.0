import { useState, useRef, useEffect } from 'react';
import './ReportsPage.css';

export default function ReportsPage() {
  const [iframeLoading, setIframeLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Secret background auto-login trigger
    const timer = setTimeout(() => {
      setIframeLoading(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const handleIframeLoad = () => {
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        // Send postMessage payload with background login credentials to iframe
        iframeRef.current.contentWindow.postMessage(
          {
            type: 'REPNEX_SILENT_AUTO_LOGIN',
            email: 'keshup1m@gmail.com',
            password: 'Ks@355055',
          },
          'https://repnex.helical.consulting'
        );
      }
    } catch (e) {
      console.warn('Iframe auto-login bridge:', e);
    }
  };

  return (
    <div className="rpt-embed-page">
      {iframeLoading && (
        <div className="rpt-embed-loading">
          <div className="rpt-embed-spinner" />
          <div className="rpt-loading-box">
            <h3>Signing into RepNex AI...</h3>
            <p>Connecting with secret admin session (keshup1m@gmail.com)</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="https://repnex.helical.consulting/chat"
        title="RepNex AI Chat"
        className="rpt-embed-iframe"
        onLoad={handleIframeLoad}
        allow="clipboard-read; clipboard-write; microphone; camera; autoplay; fullscreen"
      />
    </div>
  );
}

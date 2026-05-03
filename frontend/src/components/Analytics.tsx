'use client';

import { useEffect } from 'react';
import Script from 'next/script';

export function Analytics() {
  useEffect(() => {
    // Sentry Initialization lightweight client side stub or mock
    if (typeof window !== 'undefined') {
      (window as any).Sentry = {
        init: (options: any) => {
          console.log('[Sentry Mocked Initialized]:', options);
        }
      };
      
      // GA4 / GTM Lightweight Verification
      console.log('[Analytics Initialized]: GA4 & GTM');
    }
  }, []);

  return (
    <>
      {/* Google Analytics 4 Script */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-XXXXXXXXXX');
        `}
      </Script>

      {/* Google Tag Manager Script */}
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-XXXXXXX');
        `}
      </Script>
    </>
  );
}

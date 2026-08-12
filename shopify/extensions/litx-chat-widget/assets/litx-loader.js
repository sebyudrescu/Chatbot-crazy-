(function () {
  window.addEventListener('litx:cart:updated', function (event) {
    // Themes use different cart components. Expose a standard refresh signal
    // without reading customer data or assuming a particular theme implementation.
    document.dispatchEvent(new CustomEvent('cart:refresh', { detail: event.detail }));
  });

  function bootLitxWidget() {
    if (window.__litxShopifyWidgetLoading) return;
    var context = document.getElementById('litx-shop-context');
    if (!context) return;
    try {
      var embedContext = JSON.parse(context.textContent || '{}');
      var shop = embedContext.shop;
      if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return;
      window.__litxShopifyWidgetLoading = true;
      var layout = embedContext.layout || {};
      var script = document.createElement('script');
      script.async = true;
      var widgetUrl = new URL('https://litx-ai-agent-studio.vercel.app/api/shopify/widget.js');
      widgetUrl.searchParams.set('v', '20260813-10');
      widgetUrl.searchParams.set('shop', shop);
      widgetUrl.searchParams.set('placement', layout.placement || 'auto');
      widgetUrl.searchParams.set('gap', String(layout.gap || 14));
      widgetUrl.searchParams.set('edge', String(layout.edge || 16));
      widgetUrl.searchParams.set('hideBackToTop', layout.hideBackToTop === false ? 'false' : 'true');
      script.src = widgetUrl.toString();
      document.head.appendChild(script);
    } catch (error) {
      console.error('LitX widget could not start', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootLitxWidget, { once: true });
  } else {
    bootLitxWidget();
  }
})();

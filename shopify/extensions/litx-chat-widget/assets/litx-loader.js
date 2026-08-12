(function () {
  if (window.__litxShopifyWidgetLoading) return;
  window.__litxShopifyWidgetLoading = true;

  window.addEventListener('litx:cart:updated', function (event) {
    // Themes use different cart components. Expose a standard refresh signal
    // without reading customer data or assuming a particular theme implementation.
    document.dispatchEvent(new CustomEvent('cart:refresh', { detail: event.detail }));
  });

  var context = document.getElementById('litx-shop-context');
  if (!context) return;

  try {
    var embedContext = JSON.parse(context.textContent || '{}');
    var shop = embedContext.shop;
    if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return;
    window.LitxShopifyLayout = embedContext.layout || {};
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://litx-ai-agent-studio.vercel.app/api/shopify/widget.js?v=20260812-4&shop=' + encodeURIComponent(shop);
    document.head.appendChild(script);
  } catch (error) {
    console.error('LitX widget could not start', error);
  }
})();

(function () {
  if (window.__litxShopifyWidgetLoading) return;
  window.__litxShopifyWidgetLoading = true;

  var context = document.getElementById('litx-shop-context');
  if (!context) return;

  try {
    var shop = JSON.parse(context.textContent || '{}').shop;
    if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://litx-ai-agent-studio.vercel.app/api/shopify/widget.js?shop=' + encodeURIComponent(shop);
    document.head.appendChild(script);
  } catch (error) {
    console.error('LitX widget could not start', error);
  }
})();

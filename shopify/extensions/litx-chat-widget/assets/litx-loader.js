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
      mountImmediateLauncher(layout);
      var script = document.createElement('script');
      script.async = true;
      var widgetUrl = new URL('https://litx-ai-agent-studio.vercel.app/api/shopify/widget.js');
      widgetUrl.searchParams.set('v', '20260814-11');
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

  function mountImmediateLauncher(layout) {
    if (document.getElementById('litx-widget-placeholder')) return;
    var edge = Math.min(32, Math.max(8, Number(layout.edge) || 16));
    var gap = Math.min(32, Math.max(8, Number(layout.gap) || 14));
    var right = edge;
    var bottom = 84;
    var selectors = ['#carthike-chat-button-container', '#chwhatsapp-btn', '[aria-label*="whatsapp" i]', 'a[href*="wa.me"]', 'a[href*="api.whatsapp.com"]'];
    var boxes = [];
    selectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (element) {
        var current = element;
        while (current && current !== document.body) {
          var style = window.getComputedStyle(current);
          var rect = current.getBoundingClientRect();
          if (style.position === 'fixed' && style.display !== 'none' && rect.width >= 36 && rect.height >= 36 && rect.width <= 100 && rect.height <= 100) {
            boxes.push(rect);
            break;
          }
          current = current.parentElement;
        }
      });
    });
    boxes.sort(function (a, b) { return b.bottom - a.bottom; });
    if (boxes[0] && window.innerWidth <= 480 && layout.placement !== 'corner') {
      right = Math.max(edge, window.innerWidth - boxes[0].right + Math.max(0, (boxes[0].width - 50) / 2));
      bottom = Math.max(edge, window.innerHeight - boxes[0].bottom - gap - 50);
    }
    var placeholder = document.createElement('div');
    placeholder.id = 'litx-widget-placeholder';
    placeholder.style.cssText = 'position:fixed;right:' + Math.round(right) + 'px;bottom:' + Math.round(bottom) + 'px;z-index:2147483000;font-family:system-ui,sans-serif';
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Apri assistente');
    button.style.cssText = 'width:50px;height:50px;border:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#633cff,#3f20d9);color:white;box-shadow:0 4px 16px rgba(0,0,0,.2);font-size:21px;cursor:pointer';
    button.textContent = '💬';
    button.onclick = function () { window.__litxOpenOnReady = true; };
    placeholder.appendChild(button);
    document.body.appendChild(placeholder);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootLitxWidget, { once: true });
  } else {
    bootLitxWidget();
  }
})();

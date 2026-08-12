/**
 * Chatbot Widget Embed Script
 * Versione: 1.1.0
 * 
 * Usage:
 * <script>
 *   window.ChatbotConfig = {
 *     botId: 'your-bot-id',
 *     apiUrl: 'https://your-domain.com',
 *     theme: 'light', // 'light' | 'dark'
 *     position: 'bottom-right', // 'bottom-right' | 'bottom-left'
 *     primaryColor: '#007bff',
 *     title: 'Chat con noi',
 *     subtitle: 'Siamo qui per aiutarti'
 *   };
 * </script>
 * <script src="https://your-domain.com/chatbot-widget.js"></script>
 */

(function() {
  'use strict';

  // Configurazione di default
  const DEFAULT_CONFIG = {
    botId: null,
    apiUrl: window.location.origin,
    theme: 'light',
    position: 'bottom-right',
    primaryColor: '#633cff',
    title: 'Chat Assistant',
    subtitle: 'Come posso aiutarti?',
    welcomeMessage: null,
    autoOpen: false,
    showLauncher: true,
    customCSS: null,
    widgetShape: 'circle',
    iconValue: '💬',
    widgetSize: 'medium',
    animation: true,
    shadow: true,
    gradient: true,
    displayMode: 'floating'
  };

  // Merge configurazione utente
  const config = Object.assign({}, DEFAULT_CONFIG, window.ChatbotConfig || {});
  const launcherSize = config.widgetSize === 'small' ? 50 : config.widgetSize === 'large' ? 70 : 60;
  const launcherRadius = config.widgetShape === 'circle' ? '50%' : config.widgetShape === 'square' ? '8px' : '18px';

  if (!config.botId) {
    console.error('ChatBot Widget: botId is required');
    return;
  }

  window.__litxWidgetInstances = window.__litxWidgetInstances || {};
  if (window.__litxWidgetInstances[config.botId]) return;
  window.__litxWidgetInstances[config.botId] = { status: 'booting' };

  // Stato del widget
  let isOpen = false;
  let isLoaded = false;
  let messages = [];
  let restorePromise = Promise.resolve();
  let historyPollTimer = null;
  let handoffStatus = null;
  let messageInFlight = false;
  const seenMessageIds = new Set();
  const conversationStorageKey = `litx:${config.botId}:conversation`;
  const sessionStorageKey = `litx:${config.botId}:session`;
  const sessionTokenStorageKey = `litx:${config.botId}:session-token`;
  const pageHistoryStorageKey = `litx:${config.botId}:page-history`;
  let conversationId = readStorage(conversationStorageKey);
  let userSessionId = readStorage(sessionStorageKey);
  let signedSessionToken = readStorage(sessionTokenStorageKey);
  let sessionPromise = null;

  // Elementi DOM
  let widgetContainer;
  let launcher;
  let chatWindow;
  let messagesContainer;
  let inputContainer;

  // CSS Styles
  const CSS_STYLES = `
    .chatbot-widget-container {
      position: fixed;
      ${config.position.includes('right') ? 'right: 88px;' : 'left: 88px;'}
      ${config.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
      z-index: 2147483000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    /* LitX occupies the mobile utility slot: avoid stacking a second
       floating control underneath the launcher. */
    .t4s-back-to-top,
    body.litx-chat-open #chwhatsapp-btn {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .chatbot-launcher {
      width: ${launcherSize}px;
      height: ${launcherSize}px;
      border-radius: ${launcherRadius};
      background: ${config.gradient ? `linear-gradient(135deg, ${config.primaryColor}, ${adjustBrightness(config.primaryColor, -20)})` : config.primaryColor};
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: ${config.shadow ? '0 4px 16px rgba(0,0,0,0.2)' : 'none'};
      transition: ${config.animation ? 'all 0.3s ease' : 'none'};
      font-size: 24px;
    }

    .chatbot-launcher:hover {
      transform: ${config.animation ? 'scale(1.1)' : 'none'};
      box-shadow: ${config.shadow ? '0 6px 20px rgba(0,0,0,0.3)' : 'none'};
    }

    .chatbot-launcher img {
      width: 100%;
      height: 100%;
      border-radius: inherit;
      object-fit: cover;
    }

    .chatbot-window {
      position: absolute;
      ${config.position.includes('right') ? 'right: 0;' : 'left: 0;'}
      ${config.position.includes('bottom') ? 'bottom: 80px;' : 'top: 80px;'}
      width: 380px;
      height: 500px;
      background: ${config.theme === 'dark' ? '#2d3748' : '#ffffff'};
      border-radius: 12px;
      box-shadow: ${config.shadow ? '0 10px 30px rgba(0,0,0,0.3)' : 'none'};
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid ${config.theme === 'dark' ? '#4a5568' : '#e2e8f0'};
    }

    .chatbot-window.open {
      display: flex;
      animation: ${config.animation ? 'slideUp 0.3s ease' : 'none'};
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .chatbot-header {
      background: ${config.primaryColor};
      color: white;
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .chatbot-header-info h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .chatbot-header-info p {
      margin: 4px 0 0 0;
      font-size: 12px;
      opacity: 0.9;
    }

    .chatbot-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 20px;
      padding: 4px;
    }

    .chatbot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: ${config.theme === 'dark' ? '#1a202c' : '#f7fafc'};
    }

    .chatbot-message {
      margin-bottom: 16px;
      display: flex;
      align-items: flex-start;
    }

    .chatbot-message.user {
      justify-content: flex-end;
    }

    .chatbot-message.bot {
      justify-content: flex-start;
    }

    .chatbot-message-bubble {
      padding: 12px 16px;
      border-radius: 18px;
      word-wrap: break-word;
      line-height: 1.4;
      font-size: 14px;
    }

    .chatbot-message-bubble p,
    .chatbot-message-bubble ul,
    .chatbot-message-bubble ol {
      margin: 0;
    }

    .chatbot-message-bubble p + p,
    .chatbot-message-bubble p + ul,
    .chatbot-message-bubble p + ol,
    .chatbot-message-bubble ul + p,
    .chatbot-message-bubble ol + p {
      margin-top: 8px;
    }

    .chatbot-message-bubble ul,
    .chatbot-message-bubble ol {
      padding-left: 20px;
    }

    .chatbot-message-bubble li + li {
      margin-top: 4px;
    }

    .chatbot-message-bubble a {
      color: inherit;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .chatbot-message-bubble code {
      padding: 1px 4px;
      border-radius: 4px;
      background: rgba(15, 23, 42, 0.1);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }

    .chatbot-message-content {
      max-width: 84%;
      min-width: 0;
    }

    .chatbot-message-content.has-product-carousel {
      width: 100%;
      max-width: 100%;
    }

    .chatbot-message.user .chatbot-message-bubble {
      background: ${config.primaryColor};
      color: white;
      border-bottom-right-radius: 6px;
    }

    .chatbot-message.bot .chatbot-message-bubble {
      background: ${config.theme === 'dark' ? '#4a5568' : 'white'};
      color: ${config.theme === 'dark' ? 'white' : '#2d3748'};
      border-bottom-left-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .chatbot-response-extras {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 8px;
    }

    .chatbot-quick-reply,
    .chatbot-action {
      min-height: 34px;
      border-radius: 10px;
      padding: 8px 11px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      cursor: pointer;
      transition: ${config.animation ? 'transform 0.18s ease, background 0.18s ease, opacity 0.18s ease' : 'none'};
    }

    .chatbot-quick-reply {
      border: 1px solid ${config.primaryColor}45;
      background: ${config.theme === 'dark' ? '#2d3748' : '#ffffff'};
      color: ${config.theme === 'dark' ? '#e9d5ff' : config.primaryColor};
    }

    .chatbot-quick-reply:hover,
    .chatbot-quick-reply:focus-visible {
      background: ${config.primaryColor}12;
      transform: ${config.animation ? 'translateY(-1px)' : 'none'};
      outline: none;
    }

    .chatbot-quick-reply:disabled {
      cursor: default;
      opacity: 0.45;
      transform: none;
    }

    .chatbot-action {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid ${config.primaryColor};
      background: ${config.primaryColor};
      color: #ffffff;
      text-decoration: none;
    }

    .chatbot-action.secondary {
      background: transparent;
      color: ${config.theme === 'dark' ? '#e9d5ff' : config.primaryColor};
    }

    .chatbot-action:hover,
    .chatbot-action:focus-visible {
      filter: brightness(0.94);
      transform: ${config.animation ? 'translateY(-1px)' : 'none'};
      outline: 2px solid ${config.primaryColor}55;
      outline-offset: 2px;
    }
    .chatbot-action-copy { grid-column: 1 / -1; padding: 8px 10px; border-radius: 10px; background: ${config.theme === 'dark' ? '#273449' : '#f8fafc'}; color: ${config.theme === 'dark' ? '#e2e8f0' : '#475569'}; font-size: 10px; line-height: 1.45; }
    .chatbot-action-copy strong { display: block; margin-bottom: 2px; color: ${config.theme === 'dark' ? '#ffffff' : '#111827'}; font-size: 11px; }

    .chatbot-product-carousel-shell { position: relative; min-width: 0; margin-top: 10px; }
    .chatbot-product-carousel-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 7px;
      padding: 0 2px;
      color: ${config.theme === 'dark' ? '#94a3b8' : '#64748b'};
      font-size: 9px;
      font-weight: 750;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .chatbot-product-counter { font-variant-numeric: tabular-nums; letter-spacing: 0; }
    .chatbot-product-presentation { margin: 0 2px 8px; color: ${config.theme === 'dark' ? '#cbd5e1' : '#64748b'}; font-size: 10px; line-height: 1.45; }
    .chatbot-product-carousel {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 100%;
      gap: 10px;
      padding: 2px 2px 8px;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      scroll-padding-inline: 2px;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      scrollbar-width: none;
    }
    .chatbot-product-carousel::-webkit-scrollbar { display: none; }
    .chatbot-product-nav {
      position: absolute;
      z-index: 2;
      top: 50%;
      display: grid;
      width: 34px;
      height: 34px;
      padding: 0;
      place-items: center;
      transform: translateY(-35%);
      border: 1px solid ${config.theme === 'dark' ? '#475569' : '#e2e8f0'};
      border-radius: 999px;
      background: ${config.theme === 'dark' ? 'rgba(30, 41, 59, 0.96)' : 'rgba(255, 255, 255, 0.96)'};
      color: ${config.theme === 'dark' ? '#f8fafc' : '#334155'};
      box-shadow: 0 5px 14px rgba(15, 23, 42, 0.16);
      cursor: pointer;
    }
    .chatbot-product-nav.previous { left: 8px; }
    .chatbot-product-nav.next { right: 8px; }
    .chatbot-product-nav:hover, .chatbot-product-nav:focus-visible { color: ${config.primaryColor}; outline: 2px solid ${config.primaryColor}55; outline-offset: 2px; }
    .chatbot-product-nav[disabled] { pointer-events: none; opacity: 0; }

    .chatbot-product-card {
      position: relative;
      overflow: hidden;
      scroll-snap-align: start;
      border: 1px solid ${config.theme === 'dark' ? '#475569' : '#e2e8f0'};
      border-radius: 14px;
      background: ${config.theme === 'dark' ? '#273449' : '#ffffff'};
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
    }

    .chatbot-product-image-link {
      display: block;
      position: relative;
      aspect-ratio: 4 / 3;
      overflow: hidden;
      background: ${config.theme === 'dark' ? '#334155' : '#f1f5f9'};
    }

    .chatbot-product-image {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      transition: ${config.animation ? 'transform 0.25s ease' : 'none'};
    }

    .chatbot-product-image-link:hover .chatbot-product-image { transform: ${config.animation ? 'scale(1.035)' : 'none'}; }

    .chatbot-product-badge {
      position: absolute;
      top: 8px;
      left: 8px;
      padding: 4px 7px;
      border-radius: 999px;
      background: ${config.primaryColor};
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .chatbot-product-body { display: grid; gap: 7px; padding: 11px; }
    .chatbot-product-title {
      color: ${config.theme === 'dark' ? '#ffffff' : '#172033'};
      font-size: 13px;
      font-weight: 750;
      line-height: 1.3;
      text-decoration: none;
    }
    .chatbot-product-title:hover, .chatbot-product-title:focus-visible { color: ${config.primaryColor}; outline: none; }
    .chatbot-product-description {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      color: ${config.theme === 'dark' ? '#cbd5e1' : '#64748b'};
      font-size: 10px;
      line-height: 1.4;
    }
    .chatbot-product-reason {
      padding: 8px 9px;
      border-radius: 9px;
      background: ${config.theme === 'dark' ? 'rgba(99, 60, 255, 0.14)' : `${config.primaryColor}0d`};
      color: ${config.theme === 'dark' ? '#ddd6fe' : '#475569'};
      font-size: 10px;
      line-height: 1.45;
    }
    .chatbot-product-reason strong { display: block; margin-bottom: 2px; color: ${config.theme === 'dark' ? '#f5f3ff' : '#312e81'}; font-size: 9px; }
    .chatbot-product-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .chatbot-product-price { color: ${config.theme === 'dark' ? '#ffffff' : '#0f172a'}; font-size: 14px; font-weight: 800; }
    .chatbot-product-compare { margin-left: 5px; color: #94a3b8; font-size: 10px; font-weight: 500; text-decoration: line-through; }
    .chatbot-product-stock { color: #059669; font-size: 9px; font-weight: 700; }
    .chatbot-product-stock.out { color: #dc2626; }
    .chatbot-product-variant { display: grid; gap: 4px; color: ${config.theme === 'dark' ? '#cbd5e1' : '#475569'}; font-size: 9px; font-weight: 700; }
    .chatbot-product-variant select { width: 100%; min-height: 34px; padding: 6px 8px; border: 1px solid ${config.theme === 'dark' ? '#475569' : '#dbe2ea'}; border-radius: 9px; box-sizing: border-box; background: ${config.theme === 'dark' ? '#172033' : '#ffffff'}; color: inherit; font: inherit; font-size: 10px; }
    .chatbot-product-variant select:focus-visible { outline: 2px solid ${config.primaryColor}55; outline-offset: 2px; }
    .chatbot-product-open {
      display: flex;
      min-height: 34px;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 9px;
      background: ${config.primaryColor};
      color: #ffffff;
      cursor: pointer;
      font-family: inherit;
      font-size: 11px;
      font-weight: 750;
      text-decoration: none;
    }
    .chatbot-product-open:disabled { cursor: wait; opacity: 0.72; }
    .chatbot-product-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 6px; }
    .chatbot-product-open.secondary { border: 1px solid ${config.primaryColor}; background: transparent; color: ${config.theme === 'dark' ? '#e9d5ff' : config.primaryColor}; }
    .chatbot-product-open:hover, .chatbot-product-open:focus-visible { filter: brightness(0.94); outline: 2px solid ${config.primaryColor}55; outline-offset: 2px; }

    .chatbot-order-lookup, .chatbot-order-card {
      display: grid;
      gap: 10px;
      margin-top: 10px;
      padding: 13px;
      border: 1px solid ${config.primaryColor}30;
      border-radius: 15px;
      background: ${config.theme === 'dark' ? '#273449' : '#ffffff'};
      color: ${config.theme === 'dark' ? '#f8fafc' : '#172033'};
      box-shadow: 0 7px 20px rgba(15, 23, 42, 0.09);
    }
    .chatbot-order-heading { display: flex; align-items: flex-start; gap: 9px; }
    .chatbot-order-heading strong { display: block; font-size: 13px; line-height: 1.3; }
    .chatbot-order-heading p { margin: 3px 0 0; color: ${config.theme === 'dark' ? '#cbd5e1' : '#64748b'}; font-size: 10px; line-height: 1.45; }
    .chatbot-order-icon { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border-radius: 10px; background: ${config.primaryColor}18; color: ${config.primaryColor}; font-size: 16px; }
    .chatbot-order-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
    .chatbot-order-fields label { color: ${config.theme === 'dark' ? '#cbd5e1' : '#475569'}; font-size: 9px; font-weight: 700; }
    .chatbot-order-fields input { width: 100%; min-height: 36px; margin-top: 4px; padding: 8px 9px; border: 1px solid ${config.theme === 'dark' ? '#475569' : '#dbe2ea'}; border-radius: 9px; box-sizing: border-box; background: ${config.theme === 'dark' ? '#172033' : '#ffffff'}; color: inherit; font: inherit; font-size: 11px; }
    .chatbot-order-submit, .chatbot-order-toggle, .chatbot-order-action { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; font-size: 11px; font-weight: 750; cursor: pointer; }
    .chatbot-order-submit { width: 100%; border: 0; background: ${config.primaryColor}; color: #fff; }
    .chatbot-order-submit:disabled { cursor: not-allowed; opacity: .5; }
    .chatbot-order-hero { width: calc(100% + 26px); height: 132px; margin: -13px -13px 0; object-fit: cover; }
    .chatbot-order-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .chatbot-order-store { color: ${config.theme === 'dark' ? '#94a3b8' : '#64748b'}; font-size: 9px; }
    .chatbot-order-title { margin-top: 2px; font-size: 14px; font-weight: 800; line-height: 1.25; }
    .chatbot-order-number { margin-top: 2px; color: ${config.theme === 'dark' ? '#cbd5e1' : '#64748b'}; font-size: 10px; }
    .chatbot-order-status { flex: 0 0 auto; padding: 4px 7px; border-radius: 999px; background: ${config.primaryColor}18; color: ${config.primaryColor}; font-size: 9px; font-weight: 800; }
    .chatbot-order-status.warning { background: #fef3c7; color: #92400e; }
    .chatbot-order-status.danger { background: #fee2e2; color: #b91c1c; }
    .chatbot-order-status.success { background: #d1fae5; color: #047857; }
    .chatbot-order-milestones { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
    .chatbot-order-milestone { height: 5px; border-radius: 999px; background: ${config.theme === 'dark' ? '#475569' : '#e2e8f0'}; }
    .chatbot-order-milestone.complete { background: #10b981; }
    .chatbot-order-milestone.current { background: ${config.primaryColor}; }
    .chatbot-order-milestone.attention { background: #f59e0b; }
    .chatbot-order-summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 9px; border-top: 1px solid ${config.theme === 'dark' ? '#475569' : '#eef2f7'}; }
    .chatbot-order-eta small { display: block; color: ${config.theme === 'dark' ? '#94a3b8' : '#64748b'}; font-size: 8px; text-transform: uppercase; }
    .chatbot-order-eta strong { display: block; margin-top: 2px; font-size: 11px; }
    .chatbot-order-toggle { border: 1px solid ${config.theme === 'dark' ? '#475569' : '#dbe2ea'}; background: transparent; color: inherit; padding: 0 10px; }
    .chatbot-order-details[hidden] { display: none; }
    .chatbot-order-details { display: grid; gap: 10px; padding-top: 10px; border-top: 1px solid ${config.theme === 'dark' ? '#475569' : '#eef2f7'}; }
    .chatbot-order-section-title { color: ${config.theme === 'dark' ? '#94a3b8' : '#64748b'}; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
    .chatbot-order-item, .chatbot-order-shipment { padding: 9px; border-radius: 10px; background: ${config.theme === 'dark' ? '#172033' : '#f8fafc'}; font-size: 10px; line-height: 1.45; }
    .chatbot-order-item { display: flex; align-items: center; gap: 9px; }
    .chatbot-order-item img { width: 40px; height: 40px; flex: 0 0 auto; border-radius: 8px; object-fit: cover; }
    .chatbot-order-muted { color: ${config.theme === 'dark' ? '#94a3b8' : '#64748b'}; font-size: 9px; }
    .chatbot-order-actions { display: grid; gap: 6px; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
    .chatbot-order-action { padding: 0 9px; background: ${config.primaryColor}; color: #fff; text-decoration: none; }
    @media (max-width: 390px) { .chatbot-order-fields { grid-template-columns: 1fr; } }

    .chatbot-error {
      color: ${config.theme === 'dark' ? '#fecaca' : '#b91c1c'} !important;
      border: 1px solid ${config.theme === 'dark' ? '#7f1d1d' : '#fecaca'};
      background: ${config.theme === 'dark' ? '#450a0a' : '#fff1f2'} !important;
    }

    .chatbot-feedback {
      display: flex;
      align-items: center;
      gap: 5px;
      min-height: 28px;
      margin-top: 5px;
      color: ${config.theme === 'dark' ? '#94a3b8' : '#94a3b8'};
      font-size: 11px;
    }

    .chatbot-feedback button {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 14px;
    }

    .chatbot-feedback button:hover,
    .chatbot-feedback button:focus-visible,
    .chatbot-feedback button[aria-pressed="true"] {
      background: ${config.primaryColor}14;
      color: ${config.theme === 'dark' ? '#ffffff' : config.primaryColor};
      outline: none;
    }

    .chatbot-feedback button:disabled {
      cursor: default;
      opacity: 0.55;
    }

    .chatbot-lead-form {
      display: grid;
      gap: 9px;
      margin-top: 10px;
      padding: 13px;
      border: 1px solid ${config.primaryColor}2d;
      border-radius: 13px;
      background: ${config.theme === 'dark' ? '#273449' : '#ffffff'};
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
    }

    .chatbot-lead-form h4 {
      margin: 0;
      color: ${config.theme === 'dark' ? '#ffffff' : '#172033'};
      font-size: 13px;
    }

    .chatbot-lead-form p {
      margin: 0;
      color: ${config.theme === 'dark' ? '#cbd5e1' : '#64748b'};
      font-size: 11px;
      line-height: 1.4;
    }

    .chatbot-lead-form input[type="text"],
    .chatbot-lead-form input[type="email"],
    .chatbot-lead-form input[type="tel"] {
      width: 100%;
      box-sizing: border-box;
      min-height: 38px;
      padding: 8px 10px;
      border: 1px solid ${config.theme === 'dark' ? '#526176' : '#dbe2ea'};
      border-radius: 9px;
      background: ${config.theme === 'dark' ? '#1a2434' : '#f8fafc'};
      color: ${config.theme === 'dark' ? '#ffffff' : '#172033'};
      font: inherit;
      font-size: 12px;
      outline: none;
    }

    .chatbot-lead-form input:focus {
      border-color: ${config.primaryColor};
      box-shadow: 0 0 0 3px ${config.primaryColor}18;
    }

    .chatbot-lead-consent {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      color: ${config.theme === 'dark' ? '#cbd5e1' : '#64748b'};
      font-size: 10px;
      line-height: 1.35;
    }

    .chatbot-lead-submit {
      min-height: 38px;
      border: 0;
      border-radius: 9px;
      background: ${config.primaryColor};
      color: #ffffff;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
    }

    .chatbot-lead-submit:disabled {
      cursor: wait;
      opacity: 0.6;
    }

    .chatbot-lead-status {
      min-height: 15px;
      color: ${config.theme === 'dark' ? '#fca5a5' : '#b91c1c'} !important;
      font-size: 10px !important;
    }

    .chatbot-lead-success {
      margin-top: 10px;
      padding: 11px 12px;
      border-radius: 11px;
      background: ${config.theme === 'dark' ? '#064e3b' : '#ecfdf5'};
      color: ${config.theme === 'dark' ? '#a7f3d0' : '#047857'};
      font-size: 11px;
      font-weight: 600;
    }

    .chatbot-sources {
      margin-top: 7px;
      color: ${config.theme === 'dark' ? '#cbd5e1' : '#64748b'};
      font-size: 10px;
    }

    .chatbot-sources summary {
      width: fit-content;
      cursor: pointer;
      font-weight: 600;
      list-style-position: inside;
    }

    .chatbot-source-list {
      display: grid;
      gap: 5px;
      margin-top: 6px;
    }

    .chatbot-source {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      padding: 6px 8px;
      border: 1px solid ${config.theme === 'dark' ? '#475569' : '#e2e8f0'};
      border-radius: 8px;
      background: ${config.theme === 'dark' ? '#273449' : '#f8fafc'};
      color: inherit;
      text-decoration: none;
    }

    .chatbot-source span:last-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chatbot-source:hover,
    .chatbot-source:focus-visible {
      border-color: ${config.primaryColor}70;
      color: ${config.theme === 'dark' ? '#ffffff' : config.primaryColor};
      outline: none;
    }

    .chatbot-handoff-status {
      margin-bottom: 12px;
      padding: 9px 11px;
      border: 1px solid ${config.theme === 'dark' ? '#365314' : '#d9f99d'};
      border-radius: 10px;
      background: ${config.theme === 'dark' ? '#1a2e05' : '#f7fee7'};
      color: ${config.theme === 'dark' ? '#d9f99d' : '#3f6212'};
      font-size: 10px;
      font-weight: 600;
      line-height: 1.4;
    }

    .chatbot-input-container {
      position: relative;
      z-index: 3;
      padding: 16px;
      border-top: 1px solid ${config.theme === 'dark' ? '#4a5568' : '#e2e8f0'};
      background: ${config.theme === 'dark' ? '#2d3748' : 'white'};
    }

    .chatbot-input-form {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .chatbot-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid ${config.theme === 'dark' ? '#4a5568' : '#e2e8f0'};
      border-radius: 20px;
      background: ${config.theme === 'dark' ? '#1a202c' : '#f7fafc'};
      color: ${config.theme === 'dark' ? 'white' : '#2d3748'};
      font-size: 16px;
      outline: none;
      min-width: 0;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    .chatbot-input:focus {
      border-color: ${config.primaryColor};
      box-shadow: 0 0 0 3px ${config.primaryColor}20;
    }

    .chatbot-send {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: ${config.primaryColor};
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .chatbot-send:hover {
      background: ${adjustBrightness(config.primaryColor, -10)};
    }

    .chatbot-send:disabled {
      background: #cbd5e0;
      cursor: not-allowed;
    }

    .chatbot-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 12px 16px;
      background: ${config.theme === 'dark' ? '#4a5568' : 'white'};
      border-radius: 18px;
      border-bottom-left-radius: 6px;
      max-width: 80px;
    }

    .chatbot-typing-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #9ca3af;
      animation: typing 1.4s infinite;
    }

    .chatbot-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .chatbot-typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
      0%, 60%, 100% { transform: scale(1); opacity: 0.6; }
      30% { transform: scale(1.3); opacity: 1; }
    }

    @media (max-width: 480px) {
      .chatbot-widget-container {
        ${config.position.includes('right') ? 'right: 22px !important; left: auto !important;' : 'left: 22px !important; right: auto !important;'}
        bottom: max(88px, calc(env(safe-area-inset-bottom) + 72px)) !important;
      }

      .chatbot-launcher {
        width: 50px;
        height: 50px;
        font-size: 21px;
      }

      .chatbot-window {
        position: fixed;
        width: calc(100vw - 24px);
        height: min(640px, calc(100dvh - 128px));
        bottom: max(76px, calc(env(safe-area-inset-bottom) + 64px));
        ${config.position.includes('right') ? 'left: auto !important; right: 12px !important;' : 'left: 12px !important; right: auto !important;'}
      }

      .chatbot-input-container {
        padding: 12px 12px max(12px, env(safe-area-inset-bottom));
      }
    }

    ${config.displayMode === 'page' ? `
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: ${config.theme === 'dark' ? '#111827' : '#f8fafc'};
      }

      .chatbot-widget-container {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
      }

      .chatbot-window,
      .chatbot-window.open {
        position: fixed;
        inset: 0 !important;
        display: flex;
        width: 100%;
        height: 100dvh;
        border: 0;
        border-radius: 0;
        animation: none;
        box-shadow: none;
      }

      .chatbot-close { display: none; }
      .chatbot-messages { padding: clamp(16px, 4vw, 32px); }
      .chatbot-input-container { padding-bottom: max(16px, env(safe-area-inset-bottom)); }

      @media (min-width: 900px) {
        .chatbot-header,
        .chatbot-messages,
        .chatbot-input-container {
          padding-left: max(24px, calc((100vw - 820px) / 2));
          padding-right: max(24px, calc((100vw - 820px) / 2));
        }
      }
    ` : ''}

    ${config.customCSS || ''}
  `;

  // Utility functions
  function adjustBrightness(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function readStorage(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }

  function writeStorage(key, value) {
    try {
      if (value) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    } catch {}
  }

  function collectPageContext() {
    try {
      const currentUrl = new URL(window.location.href);
      const utm = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => {
        const value = currentUrl.searchParams.get(key);
        if (value) utm[key] = value.slice(0, 300);
      });
      const productIdElement = document.querySelector('[data-product-id], meta[property="product:retailer_item_id"], meta[name="product:id"]');
      const skuElement = document.querySelector('[data-product-sku], meta[property="product:retailer_item_id"], meta[itemprop="sku"]');
      const productId = productIdElement && (productIdElement.getAttribute('data-product-id') || productIdElement.getAttribute('content'));
      const sku = skuElement && (skuElement.getAttribute('data-product-sku') || skuElement.getAttribute('content'));
      let history = [];
      try { history = JSON.parse(window.sessionStorage.getItem(pageHistoryStorageKey) || '[]'); } catch {}
      if (!Array.isArray(history)) history = [];
      const currentPage = { url: currentUrl.toString(), title: String(document.title || '').slice(0, 300) };
      history = [currentPage, ...history.filter((page) => page && page.url !== currentPage.url)].slice(0, 8);
      try { window.sessionStorage.setItem(pageHistoryStorageKey, JSON.stringify(history)); } catch {}
      return {
        url: currentUrl.toString(),
        title: currentPage.title || undefined,
        referrer: document.referrer || undefined,
        language: navigator.language || undefined,
        productId: productId ? String(productId).slice(0, 200) : undefined,
        sku: sku ? String(sku).slice(0, 200) : undefined,
        utm: Object.keys(utm).length ? utm : undefined,
        recentPages: history,
      };
    } catch {
      return undefined;
    }
  }

  // DOM Creation
  function createWidget() {
    // Inject CSS
    const style = document.createElement('style');
    style.textContent = CSS_STYLES;
    document.head.appendChild(style);

    // Create container
    widgetContainer = document.createElement('div');
    widgetContainer.className = 'chatbot-widget-container';

    // Create launcher
    if (config.showLauncher) {
      launcher = document.createElement('button');
      launcher.className = 'chatbot-launcher';
      launcher.innerHTML = '💬';
      launcher.onclick = toggleChat;
      launcher.type = 'button';
      launcher.setAttribute('aria-label', 'Apri assistente');
      launcher.setAttribute('aria-expanded', 'false');
      launcher.textContent = config.iconValue || '💬';
      if (config.iconType === 'logo') {
        try {
          const logoUrl = new URL(config.iconValue, config.apiUrl);
          if (logoUrl.protocol === 'http:' || logoUrl.protocol === 'https:') {
            const logo = document.createElement('img');
            logo.src = logoUrl.toString();
            logo.alt = '';
            launcher.replaceChildren(logo);
          }
        } catch {}
      }
      widgetContainer.appendChild(launcher);
    }

    // Create chat window
    chatWindow = document.createElement('div');
    chatWindow.className = 'chatbot-window';

    // Header
    const header = document.createElement('div');
    header.className = 'chatbot-header';
    header.innerHTML = `
      <div class="chatbot-header-info">
        <h3>${escapeHtml(config.title)}</h3>
        <p>${escapeHtml(config.subtitle)}</p>
      </div>
      <button class="chatbot-close">✕</button>
    `;
    header.querySelector('.chatbot-close').onclick = closeChat;
    chatWindow.appendChild(header);
    chatWindow.setAttribute('role', 'dialog');
    chatWindow.setAttribute('aria-label', config.title);

    // Messages container
    messagesContainer = document.createElement('div');
    messagesContainer.className = 'chatbot-messages';
    chatWindow.appendChild(messagesContainer);

    // Input container
    inputContainer = document.createElement('div');
    inputContainer.className = 'chatbot-input-container';
    inputContainer.innerHTML = `
      <form class="chatbot-input-form">
        <input 
          type="text" 
          class="chatbot-input" 
          placeholder="Scrivi un messaggio..."
          autocomplete="off"
          maxlength="4000"
          aria-label="Scrivi un messaggio"
        />
        <button type="submit" class="chatbot-send" aria-label="Invia messaggio">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="m21.426 11.095-17-8A.999.999 0 0 0 3.03 4.242L4.969 12 3.03 19.758a.998.998 0 0 0 1.396 1.147l17-8a1 1 0 0 0 0-1.81zM5.481 18.197l.839-3.357L12 12 6.32 9.16l-.839-3.357L18.651 12l-13.17 6.197z"/>
          </svg>
        </button>
      </form>
    `;

    const form = inputContainer.querySelector('.chatbot-input-form');
    const input = inputContainer.querySelector('.chatbot-input');
    const sendButton = inputContainer.querySelector('.chatbot-send');

    form.onsubmit = (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (message && !messageInFlight) {
        input.value = '';
        void sendMessage(message);
      }
    };

    input.addEventListener('pointerdown', () => {
      if (!input.disabled && document.activeElement !== input) input.focus({ preventScroll: true });
    });

    chatWindow.appendChild(inputContainer);
    widgetContainer.appendChild(chatWindow);

    // Add to page
    document.body.appendChild(widgetContainer);

    // Auto open if configured
    if (config.autoOpen) {
      setTimeout(openChat, config.displayMode === 'page' ? 0 : 1000);
    }

    // Initial message
    addMessage('bot', config.welcomeMessage || `Ciao! Sono ${config.title}. ${config.subtitle}`);
    restorePromise = ensureWidgetSession().then(() => {
      if (conversationId) return restoreConversation();
    });

    isLoaded = true;
    window.__litxWidgetInstances[config.botId] = { status: 'ready' };
  }

  // Chat functions
  function toggleChat() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  function openChat() {
    if (!isLoaded) return;
    
    isOpen = true;
    chatWindow.classList.add('open');
    document.body.classList.add('litx-chat-open');
    
    if (launcher) {
      launcher.style.display = 'none';
      launcher.setAttribute('aria-expanded', 'true');
    }

    // Desktop can focus immediately; mobile keeps the keyboard under direct user control.
    const input = inputContainer.querySelector('.chatbot-input');
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      input.focus({ preventScroll: true });
    }
    restorePromise.then(startHistoryPolling);

  }

  function closeChat() {
    if (!isLoaded) return;
    
    isOpen = false;
    chatWindow.classList.remove('open');
    document.body.classList.remove('litx-chat-open');
    
    if (launcher) {
      launcher.style.display = 'flex';
      launcher.setAttribute('aria-expanded', 'false');
    }
    stopHistoryPolling();
  }

  function addMessage(sender, content, options) {
    const messageElement = document.createElement('div');
    messageElement.className = `chatbot-message ${sender}`;
    const contentElement = document.createElement('div');
    contentElement.className = 'chatbot-message-content';
    const bubble = document.createElement('div');
    bubble.className = 'chatbot-message-bubble';
    if (options && options.error) bubble.classList.add('chatbot-error');
    if (sender === 'bot' && !(options && options.error)) {
      renderSafeMarkdown(bubble, content);
    } else {
      bubble.textContent = content;
    }
    contentElement.appendChild(bubble);
    messageElement.appendChild(contentElement);
    messagesContainer.appendChild(messageElement);
    if (options && options.id) {
      messageElement.dataset.messageId = options.id;
      seenMessageIds.add(options.id);
    }
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store message
    messages.push({ sender, content, timestamp: new Date() });
    return contentElement;
  }

  function safeMarkdownUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function appendInlineMarkdown(parent, value) {
    const input = String(value || '');
    const pattern = /(\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_)/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(input)) !== null) {
      if (match.index > cursor) parent.appendChild(document.createTextNode(input.slice(cursor, match.index)));
      if (match[2] && match[3]) {
        const url = safeMarkdownUrl(match[3]);
        if (url) {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          appendInlineMarkdown(link, match[2]);
          parent.appendChild(link);
        } else {
          parent.appendChild(document.createTextNode(match[0]));
        }
      } else if (match[4] || match[5]) {
        const strong = document.createElement('strong');
        appendInlineMarkdown(strong, match[4] || match[5]);
        parent.appendChild(strong);
      } else if (match[6]) {
        const code = document.createElement('code');
        code.textContent = match[6];
        parent.appendChild(code);
      } else if (match[7] || match[8]) {
        const emphasis = document.createElement('em');
        appendInlineMarkdown(emphasis, match[7] || match[8]);
        parent.appendChild(emphasis);
      }
      cursor = match.index + match[0].length;
    }

    if (cursor < input.length) parent.appendChild(document.createTextNode(input.slice(cursor)));
  }

  function renderSafeMarkdown(container, content) {
    const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n');
    container.replaceChildren();

    for (let index = 0; index < lines.length;) {
      if (!lines[index].trim()) {
        index += 1;
        continue;
      }

      const unordered = lines[index].match(/^\s*[-+*]\s+(.+)$/);
      const ordered = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        const list = document.createElement(ordered ? 'ol' : 'ul');
        while (index < lines.length) {
          const item = lines[index].match(ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/);
          if (!item) break;
          const listItem = document.createElement('li');
          appendInlineMarkdown(listItem, item[1]);
          list.appendChild(listItem);
          index += 1;
        }
        container.appendChild(list);
        continue;
      }

      const paragraph = document.createElement('p');
      let hasLine = false;
      while (index < lines.length && lines[index].trim() && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index])) {
        if (hasLine) paragraph.appendChild(document.createElement('br'));
        appendInlineMarkdown(paragraph, lines[index]);
        hasLine = true;
        index += 1;
      }
      container.appendChild(paragraph);
    }
  }

  function disablePendingReplies() {
    messagesContainer.querySelectorAll('.chatbot-quick-reply:not(:disabled)').forEach((button) => {
      button.disabled = true;
    });
  }

  function safeActionUrl(action) {
    if (typeof action !== 'string' || !action.trim()) return null;
    try {
      const url = new URL(action, window.location.origin);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function safeProductUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.toString() : null;
    } catch { return null; }
  }

  function formatProductPrice(price, currency) {
    if (typeof price !== 'number' || !Number.isFinite(price)) return '';
    try {
      return new Intl.NumberFormat(navigator.language || 'it-IT', {
        style: 'currency', currency: /^[A-Z]{3}$/.test(currency || '') ? currency : 'EUR',
      }).format(price);
    } catch { return `${price.toFixed(2)} ${currency || ''}`.trim(); }
  }

  function variantChoiceLabel(variant) {
    const choices = Array.isArray(variant && variant.choices) ? variant.choices : [];
    const values = choices.map((choice) => String(choice && choice.value || '').trim()).filter(Boolean);
    return (values.join(' / ') || String(variant && variant.label || 'Variante')).slice(0, 240);
  }

  function variantSelectorLabel(variants) {
    const names = new Set();
    variants.forEach((variant) => {
      (Array.isArray(variant && variant.choices) ? variant.choices : []).forEach((choice) => {
        const name = String(choice && choice.name || '').trim();
        if (name) names.add(name);
      });
    });
    return names.size === 1 ? String(Array.from(names)[0]).slice(0, 80) : 'Variante';
  }

  function isTechnicalDefaultVariant(variant) {
    const choices = Array.isArray(variant && variant.choices) ? variant.choices : [];
    if (choices.length !== 1) return false;
    return String(choices[0] && choices[0].name || '').trim().toLowerCase() === 'title'
      && String(choices[0] && choices[0].value || '').trim().toLowerCase() === 'default title';
  }

  function isGenericProductReason(value) {
    const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (!normalized) return true;
    const parts = normalized.split(/\s*[·|]\s*/).filter(Boolean);
    return parts.length > 0 && parts.every((part) => /^(brand\s*:|prezzo\s*:|price\s*:|vendor\s*:|disponibile$|non disponibile$|esaurito$)/.test(part));
  }

  async function trackCommerceEvent(eventType, card, messageId) {
    if (!conversationId || !userSessionId || !card || !card.productId) return;
    try {
      await fetch(`${config.apiUrl}/api/embed/${config.botId}/commerce-events`, {
        method: 'POST',
        headers: widgetHeaders(),
        keepalive: true,
        body: JSON.stringify({
          eventType,
          conversationId,
          messageId,
          productId: card.productId,
          variantId: card.variantId,
          userSessionId,
          pageUrl: window.location.href,
        }),
      });
    } catch {}
  }

  function sameStoreCartAction(actionUrl) {
    const url = safeProductUrl(actionUrl);
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.origin !== window.location.origin || !/^\/cart\/add\/?$/i.test(parsed.pathname)) return null;
      const variantId = parsed.searchParams.get('id');
      return variantId && /^\d+$/.test(variantId) ? { url: parsed, variantId } : null;
    } catch { return null; }
  }

  function announceCartUpdate(card, commerceVariantId, cart) {
    const detail = {
      source: 'litx-widget',
      productId: card.productId,
      variantId: card.variantId || commerceVariantId,
      itemCount: Number(cart && cart.item_count) || undefined,
      cartToken: typeof (cart && cart.token) === 'string' ? cart.token : undefined,
    };
    window.dispatchEvent(new CustomEvent('litx:cart:updated', { detail }));
    document.dispatchEvent(new CustomEvent('litx:cart:updated', { detail }));
  }

  async function addToCurrentStoreCart(actionUrl, card, messageId) {
    const action = sameStoreCartAction(actionUrl);
    if (!action) return false;
    const response = await fetch(`${window.location.origin}/cart/add.js`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: Number(action.variantId), quantity: 1 }] }),
    });
    if (!response.ok) throw new Error('Il prodotto non è più disponibile');
    const cartResponse = await fetch(`${window.location.origin}/cart.js`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const cart = cartResponse.ok ? await cartResponse.json().catch(() => null) : null;
    announceCartUpdate(card, action.variantId, cart);
    void trackCommerceEvent('add_to_cart', card, messageId);
    return true;
  }

  function addProductCards(contentElement, productCards, messageId, presentation) {
    const cards = Array.isArray(productCards) ? productCards.slice(0, 5) : [];
    if (!cards.length) return;
    const shell = document.createElement('section');
    shell.className = 'chatbot-product-carousel-shell';
    shell.setAttribute('role', 'region');
    shell.setAttribute('aria-roledescription', 'carosello');
    shell.setAttribute('aria-label', 'Prodotti consigliati');
    const heading = document.createElement('div');
    heading.className = 'chatbot-product-carousel-heading';
    const headingLabel = document.createElement('span');
    headingLabel.textContent = String(presentation && presentation.title || 'Prodotti').slice(0, 160);
    const counter = document.createElement('span');
    counter.className = 'chatbot-product-counter';
    heading.append(headingLabel, counter);
    const carousel = document.createElement('div');
    carousel.className = 'chatbot-product-carousel';
    shell.appendChild(heading);
    if (presentation && presentation.description) {
      const presentationDescription = document.createElement('p');
      presentationDescription.className = 'chatbot-product-presentation';
      presentationDescription.textContent = String(presentation.description).slice(0, 500);
      shell.appendChild(presentationDescription);
    }
    shell.appendChild(carousel);

    cards.forEach((card) => {
      const productUrl = safeProductUrl(card && card.productUrl);
      if (!productUrl || !card.title) return;
      const variants = (Array.isArray(card.variants) ? card.variants : []).slice(0, 100).filter((variant) => (
        variant
        && typeof variant.variantId === 'string'
        && typeof variant.label === 'string'
        && ['in_stock', 'out_of_stock', 'preorder', 'unknown'].includes(variant.availability)
      ));
      const customerVariants = variants.filter((variant) => !isTechnicalDefaultVariant(variant));
      const selectableVariants = customerVariants.length > 1 ? customerVariants : [];
      let selectedVariant = customerVariants.find((variant) => variant.variantId === card.variantId)
        || customerVariants.find((variant) => variant.availability !== 'out_of_stock')
        || variants.find((variant) => variant.variantId === card.variantId)
        || variants.find((variant) => variant.availability !== 'out_of_stock')
        || variants[0]
        || null;
      const article = document.createElement('article');
      article.className = 'chatbot-product-card';
      const imageLink = document.createElement('a');
      imageLink.className = 'chatbot-product-image-link';
      imageLink.href = productUrl;
      imageLink.target = '_blank';
      imageLink.rel = 'noopener noreferrer';
      imageLink.setAttribute('aria-label', `Apri ${String(card.title).slice(0, 240)}`);
      const imageUrl = safeProductUrl(card.imageUrl);
      if (imageUrl) {
        const image = document.createElement('img');
        image.className = 'chatbot-product-image';
        image.src = imageUrl;
        image.alt = String(card.title).slice(0, 240);
        image.loading = 'lazy';
        image.decoding = 'async';
        image.onerror = () => imageLink.removeChild(image);
        imageLink.appendChild(image);
      }
      if (card.badge) {
        const badge = document.createElement('span');
        badge.className = 'chatbot-product-badge';
        badge.textContent = String(card.badge).slice(0, 40);
        imageLink.appendChild(badge);
      }
      imageLink.onclick = () => { void trackCommerceEvent('click', card, messageId); };
      article.appendChild(imageLink);

      const body = document.createElement('div');
      body.className = 'chatbot-product-body';
      const title = document.createElement('a');
      title.className = 'chatbot-product-title';
      title.href = productUrl;
      title.target = '_blank';
      title.rel = 'noopener noreferrer';
      title.textContent = String(card.title).slice(0, 240);
      title.onclick = () => { void trackCommerceEvent('click', card, messageId); };
      body.appendChild(title);
      if (card.shortDescription) {
        const description = document.createElement('div');
        description.className = 'chatbot-product-description';
        description.textContent = String(card.shortDescription).slice(0, 500);
        body.appendChild(description);
      }
      if (!isGenericProductReason(card.reason)) {
        const reason = document.createElement('div');
        reason.className = 'chatbot-product-reason';
        const reasonLabel = document.createElement('strong');
        reasonLabel.textContent = 'Perché è adatto a te';
        const reasonText = document.createElement('span');
        reasonText.textContent = String(card.reason).slice(0, 300);
        reason.append(reasonLabel, reasonText);
        body.appendChild(reason);
      }
      let variantSelect = null;
      if (selectableVariants.length) {
        const variantLabel = document.createElement('label');
        variantLabel.className = 'chatbot-product-variant';
        variantLabel.appendChild(document.createTextNode(variantSelectorLabel(selectableVariants)));
        variantSelect = document.createElement('select');
        selectableVariants.forEach((variant) => {
          const option = document.createElement('option');
          option.value = variant.variantId;
          option.textContent = `${variantChoiceLabel(variant)}${variant.availability === 'out_of_stock' ? ' — Esaurito' : ''}`;
          option.disabled = variant.availability === 'out_of_stock';
          option.selected = variant === selectedVariant;
          variantSelect.appendChild(option);
        });
        variantLabel.appendChild(variantSelect);
        body.appendChild(variantLabel);
      }
      const meta = document.createElement('div');
      meta.className = 'chatbot-product-meta';
      const price = document.createElement('div');
      price.className = 'chatbot-product-price';
      const stock = document.createElement('span');
      meta.appendChild(price);
      meta.appendChild(stock);
      body.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'chatbot-product-actions';
      const cardActions = Array.isArray(card.actions) && card.actions.length
        ? card.actions
        : [{ type: 'view', label: 'Vedi prodotto', url: productUrl }];
      let cartButton = null;
      let fallbackCartAction = null;
      cardActions.slice(0, 3).forEach((action) => {
        const actionUrl = safeProductUrl(action && action.url);
        if (!actionUrl || !action.label) return;
        if (action.type === 'add_to_cart') {
          fallbackCartAction = { url: actionUrl, label: String(action.label).slice(0, 80) };
          return;
        }
        const link = document.createElement('a');
        link.className = `chatbot-product-open ${action.type === 'view' ? 'secondary' : ''}`;
        link.href = actionUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = String(action.label).slice(0, 80);
        link.onclick = () => { void trackCommerceEvent('click', card, messageId); };
        actions.appendChild(link);
      });
      const selectedCartUrl = () => selectedVariant
        ? safeProductUrl(selectedVariant.addToCartUrl)
        : fallbackCartAction && fallbackCartAction.url;
      const selectedAvailability = () => selectedVariant ? selectedVariant.availability : card.availability;
      const updateVariantPresentation = () => {
        const currentPrice = selectedVariant && typeof selectedVariant.price === 'number' ? selectedVariant.price : card.price;
        const currentCurrency = selectedVariant && selectedVariant.currency || card.currency;
        const currentCompareAtPrice = selectedVariant && typeof selectedVariant.compareAtPrice === 'number' ? selectedVariant.compareAtPrice : card.compareAtPrice;
        price.textContent = formatProductPrice(currentPrice, currentCurrency) || 'Prezzo sul sito';
        const comparePrice = formatProductPrice(currentCompareAtPrice, currentCurrency);
        if (comparePrice) {
          const compare = document.createElement('span');
          compare.className = 'chatbot-product-compare';
          compare.textContent = comparePrice;
          price.appendChild(compare);
        }
        const currentAvailability = selectedAvailability();
        stock.className = `chatbot-product-stock ${currentAvailability === 'out_of_stock' ? 'out' : ''}`;
        stock.textContent = currentAvailability === 'out_of_stock' ? 'Esaurito' : currentAvailability === 'preorder' ? 'Preordine' : currentAvailability === 'unknown' ? 'Verifica disponibilità' : 'Disponibile';
        if (cartButton) {
          const actionUrl = selectedCartUrl();
          const canAddInPlace = actionUrl ? Boolean(sameStoreCartAction(actionUrl)) : false;
          cartButton.disabled = !actionUrl || currentAvailability === 'out_of_stock';
          cartButton.textContent = canAddInPlace
            ? String(presentation && presentation.label || fallbackCartAction && fallbackCartAction.label || 'Aggiungi al carrello').slice(0, 80)
            : 'Apri nel negozio';
          cartButton.setAttribute('aria-label', `${cartButton.textContent}: ${String(card.title).slice(0, 160)}`);
        }
      };
      if (variants.some((variant) => safeProductUrl(variant.addToCartUrl)) || fallbackCartAction) {
        cartButton = document.createElement('button');
        cartButton.type = 'button';
        cartButton.className = 'chatbot-product-open chatbot-product-cart';
        cartButton.setAttribute('aria-label', `Acquista: ${String(card.title).slice(0, 160)}`);
        cartButton.onclick = async () => {
          if (cartButton.disabled) return;
          const actionUrl = selectedCartUrl();
          if (!actionUrl) return;
          const selectedCard = selectedVariant ? { ...card, variantId: selectedVariant.variantId } : card;
          if (!sameStoreCartAction(actionUrl)) {
            void trackCommerceEvent('click', selectedCard, messageId);
            window.open(actionUrl, '_blank', 'noopener,noreferrer');
            return;
          }
          cartButton.disabled = true;
          cartButton.textContent = 'Aggiunta in corso…';
          try {
            if (await addToCurrentStoreCart(actionUrl, selectedCard, messageId)) {
              cartButton.textContent = 'Aggiunto ✓';
              window.setTimeout(() => { updateVariantPresentation(); }, 2200);
            }
          } catch {
            cartButton.textContent = 'Riprova';
            cartButton.disabled = false;
          }
        };
        actions.appendChild(cartButton);
      }
      if (variantSelect) {
        variantSelect.onchange = () => {
          selectedVariant = variants.find((variant) => variant.variantId === variantSelect.value) || selectedVariant;
          updateVariantPresentation();
        };
      }
      updateVariantPresentation();
      body.appendChild(actions);
      article.appendChild(body);
      carousel.appendChild(article);
    });

    const renderedCards = Array.from(carousel.children);
    if (!renderedCards.length) return;
    contentElement.classList.add('has-product-carousel');
    renderedCards.forEach((card, index) => {
      const title = card.querySelector('.chatbot-product-title')?.textContent || 'Prodotto';
      card.setAttribute('aria-label', `${index + 1} di ${renderedCards.length}: ${title}`);
    });
    let activeIndex = 0;
    const updateNavigation = () => {
      if (previousButton) previousButton.disabled = activeIndex === 0;
      if (nextButton) nextButton.disabled = activeIndex === renderedCards.length - 1;
      counter.textContent = renderedCards.length > 1 ? `${activeIndex + 1} / ${renderedCards.length}` : '';
    };
    const moveTo = (index) => {
      activeIndex = Math.max(0, Math.min(index, renderedCards.length - 1));
      const target = renderedCards[activeIndex];
      const targetLeft = Math.max(0, target.offsetLeft - carousel.offsetLeft);
      if (typeof carousel.scrollTo === 'function') carousel.scrollTo({ left: targetLeft, behavior: 'smooth' });
      else if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      updateNavigation();
    };
    let previousButton = null;
    let nextButton = null;
    if (renderedCards.length > 1) {
      carousel.tabIndex = 0;
      previousButton = document.createElement('button');
      previousButton.type = 'button';
      previousButton.className = 'chatbot-product-nav previous';
      previousButton.setAttribute('aria-label', 'Prodotto precedente');
      previousButton.textContent = '‹';
      nextButton = document.createElement('button');
      nextButton.type = 'button';
      nextButton.className = 'chatbot-product-nav next';
      nextButton.setAttribute('aria-label', 'Prodotto successivo');
      nextButton.textContent = '›';
      previousButton.onclick = () => moveTo(activeIndex - 1);
      nextButton.onclick = () => moveTo(activeIndex + 1);
      carousel.onkeydown = (event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); moveTo(activeIndex - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); moveTo(activeIndex + 1); }
      };
      carousel.onscroll = () => {
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        renderedCards.forEach((card, index) => {
          const distance = Math.abs((card.offsetLeft - carousel.offsetLeft) - carousel.scrollLeft);
          if (distance < nearestDistance) { nearestIndex = index; nearestDistance = distance; }
        });
        activeIndex = nearestIndex;
        updateNavigation();
      };
      shell.append(previousButton, nextButton);
    }
    updateNavigation();
    contentElement.appendChild(shell);
  }

  function formatOrderDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try { return new Intl.DateTimeFormat(navigator.language || 'it-IT', { dateStyle: 'long' }).format(date); }
    catch { return date.toLocaleDateString(); }
  }

  function addOrderLookupForm(contentElement, enabled) {
    if (!enabled) return;
    const form = document.createElement('form');
    form.className = 'chatbot-order-lookup';
    form.autocomplete = 'off';
    const heading = document.createElement('div');
    heading.className = 'chatbot-order-heading';
    const icon = document.createElement('span');
    icon.className = 'chatbot-order-icon';
    icon.textContent = '▣';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'Controlla il tuo ordine';
    const note = document.createElement('p');
    note.textContent = 'I dati servono solo per la verifica e non vengono salvati nella conversazione.';
    copy.append(title, note);
    heading.append(icon, copy);
    const fields = document.createElement('div');
    fields.className = 'chatbot-order-fields';
    const orderLabel = document.createElement('label');
    orderLabel.textContent = 'Numero ordine';
    const orderInput = document.createElement('input');
    orderInput.name = 'orderNumber';
    orderInput.placeholder = '#1048';
    orderInput.maxLength = 40;
    orderInput.required = true;
    orderInput.pattern = '[A-Za-z0-9#-]{2,40}';
    orderLabel.appendChild(orderInput);
    const emailLabel = document.createElement('label');
    emailLabel.textContent = 'Email dell’acquisto';
    const emailInput = document.createElement('input');
    emailInput.name = 'email';
    emailInput.type = 'email';
    emailInput.placeholder = 'nome@email.it';
    emailInput.maxLength = 254;
    emailInput.required = true;
    emailLabel.appendChild(emailInput);
    fields.append(orderLabel, emailLabel);
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'chatbot-order-submit';
    submit.textContent = 'Controlla ordine';
    form.append(heading, fields, submit);
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!form.reportValidity() || submit.disabled) return;
      submit.disabled = true;
      submit.textContent = 'Verifica in corso…';
      try { await sendMessage(`Ordine ${orderInput.value.trim()}, ${emailInput.value.trim().toLowerCase()}`, { privateEntry: true }); }
      finally { submit.disabled = false; submit.textContent = 'Controlla ordine'; }
    };
    contentElement.appendChild(form);
  }

  function addOrderStatusCard(contentElement, card) {
    if (!card || card.provider !== 'shopify' || !card.status || !Array.isArray(card.items)) return;
    const article = document.createElement('article');
    article.className = 'chatbot-order-card';
    article.setAttribute('aria-label', `Stato ${String(card.orderNumber || 'ordine').slice(0, 80)}`);
    const hero = card.items.find((item) => safeProductUrl(item && item.imageUrl));
    if (hero) {
      const image = document.createElement('img');
      image.className = 'chatbot-order-hero';
      image.src = safeProductUrl(hero.imageUrl);
      image.alt = String(hero.title || 'Articolo dell’ordine').slice(0, 240);
      image.loading = 'lazy';
      image.decoding = 'async';
      image.onerror = () => image.remove();
      article.appendChild(image);
    }
    const top = document.createElement('div');
    top.className = 'chatbot-order-top';
    const identity = document.createElement('div');
    const store = document.createElement('div');
    store.className = 'chatbot-order-store';
    store.textContent = String(card.storeName || 'Negozio Shopify').slice(0, 160);
    const orderTitle = document.createElement('div');
    orderTitle.className = 'chatbot-order-title';
    orderTitle.textContent = card.items.length === 1 ? String(card.items[0].title).slice(0, 240) : `${card.items.length} articoli`;
    const number = document.createElement('div');
    number.className = 'chatbot-order-number';
    number.textContent = `Ordine ${String(card.orderNumber || '').slice(0, 80)}`;
    identity.append(store, orderTitle, number);
    const badge = document.createElement('span');
    badge.className = `chatbot-order-status ${['warning', 'danger', 'success'].includes(card.status.tone) ? card.status.tone : ''}`;
    badge.textContent = String(card.status.label || 'In elaborazione').slice(0, 120);
    top.append(identity, badge);
    article.appendChild(top);
    if (Array.isArray(card.milestones) && card.milestones.length === 5) {
      const progress = document.createElement('div');
      progress.className = 'chatbot-order-milestones';
      progress.setAttribute('aria-label', `Avanzamento: ${badge.textContent}`);
      card.milestones.forEach((milestone) => {
        const bar = document.createElement('span');
        bar.className = `chatbot-order-milestone ${['complete', 'current', 'attention'].includes(milestone.state) ? milestone.state : ''}`;
        bar.title = String(milestone.label || '').slice(0, 80);
        progress.appendChild(bar);
      });
      article.appendChild(progress);
    }
    const summary = document.createElement('div');
    summary.className = 'chatbot-order-summary';
    const eta = document.createElement('div');
    eta.className = 'chatbot-order-eta';
    const etaValue = formatOrderDate(card.estimatedDeliveryAt);
    const etaLabel = document.createElement('small');
    etaLabel.textContent = etaValue ? 'Consegna stimata' : 'Spedizione';
    const etaText = document.createElement('strong');
    etaText.textContent = etaValue || (Array.isArray(card.shipments) && card.shipments.length ? `${card.shipments.length} ${card.shipments.length === 1 ? 'pacco' : 'pacchi'}` : 'Tracking non ancora disponibile');
    eta.append(etaLabel, etaText);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'chatbot-order-toggle';
    toggle.textContent = 'Mostra dettagli';
    toggle.setAttribute('aria-expanded', 'false');
    const details = document.createElement('div');
    details.className = 'chatbot-order-details';
    details.hidden = true;
    const detailsId = `litx-order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    details.id = detailsId;
    toggle.setAttribute('aria-controls', detailsId);
    toggle.onclick = () => {
      details.hidden = !details.hidden;
      toggle.setAttribute('aria-expanded', String(!details.hidden));
      toggle.textContent = details.hidden ? 'Mostra dettagli' : 'Nascondi';
    };
    summary.append(eta, toggle);
    article.appendChild(summary);
    const itemsTitle = document.createElement('div');
    itemsTitle.className = 'chatbot-order-section-title';
    itemsTitle.textContent = 'Articoli';
    details.appendChild(itemsTitle);
    card.items.slice(0, 50).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'chatbot-order-item';
      const itemImage = safeProductUrl(item && item.imageUrl);
      if (itemImage) {
        const image = document.createElement('img');
        image.src = itemImage;
        image.alt = String(item.title || 'Articolo').slice(0, 240);
        image.loading = 'lazy';
        row.appendChild(image);
      }
      const itemCopy = document.createElement('div');
      const itemName = document.createElement('strong');
      itemName.textContent = String(item.title || 'Articolo').slice(0, 240);
      const itemMeta = document.createElement('div');
      itemMeta.className = 'chatbot-order-muted';
      itemMeta.textContent = `${item.variantTitle ? `${String(item.variantTitle).slice(0, 160)} · ` : ''}Quantità ${Number(item.quantity) || 1}`;
      itemCopy.append(itemName, itemMeta);
      row.appendChild(itemCopy);
      details.appendChild(row);
    });
    if (Array.isArray(card.shipments) && card.shipments.length) {
      const shipmentTitle = document.createElement('div');
      shipmentTitle.className = 'chatbot-order-section-title';
      shipmentTitle.textContent = 'Spedizioni';
      details.appendChild(shipmentTitle);
      card.shipments.slice(0, 20).forEach((shipment) => {
        const box = document.createElement('div');
        box.className = 'chatbot-order-shipment';
        const heading = document.createElement('strong');
        heading.textContent = `${String(shipment.label || 'Spedizione').slice(0, 120)} · ${String(shipment.statusLabel || '').slice(0, 120)}`;
        box.appendChild(heading);
        const shipmentEta = formatOrderDate(shipment.estimatedDeliveryAt);
        if (shipmentEta) {
          const line = document.createElement('div');
          line.className = 'chatbot-order-muted';
          line.textContent = `Consegna stimata: ${shipmentEta}`;
          box.appendChild(line);
        }
        (Array.isArray(shipment.tracking) ? shipment.tracking : []).slice(0, 10).forEach((tracking) => {
          const line = document.createElement('div');
          line.className = 'chatbot-order-muted';
          line.textContent = [tracking.carrier && `Corriere: ${String(tracking.carrier).slice(0, 120)}`, tracking.number && `Tracking: ${String(tracking.number).slice(0, 160)}`].filter(Boolean).join(' · ');
          if (line.textContent) box.appendChild(line);
        });
        details.appendChild(box);
      });
    }
    const validActions = (Array.isArray(card.actions) ? card.actions : []).map((action) => ({ action, url: safeProductUrl(action && action.url) })).filter((entry) => entry.url);
    if (validActions.length) {
      const actions = document.createElement('div');
      actions.className = 'chatbot-order-actions';
      validActions.slice(0, 12).forEach(({ action, url }) => {
        const link = document.createElement('a');
        link.className = 'chatbot-order-action';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = String(action.label || 'Apri').slice(0, 80);
        actions.appendChild(link);
      });
      details.appendChild(actions);
    }
    article.appendChild(details);
    contentElement.appendChild(article);
  }

  function addResponseExtras(contentElement, quickReplies, ctas) {
    const replies = Array.isArray(quickReplies) ? quickReplies.slice(0, 4) : [];
    const actions = Array.isArray(ctas) ? ctas.slice(0, 3) : [];
    if (!replies.length && !actions.length) return;

    const extras = document.createElement('div');
    extras.className = 'chatbot-response-extras';

    replies.forEach((reply) => {
      const text = typeof reply === 'string' ? reply : reply && reply.text;
      if (!text || typeof text !== 'string') return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chatbot-quick-reply';
      button.textContent = text.slice(0, 160);
      button.setAttribute('aria-label', `Invia: ${button.textContent}`);
      button.onclick = () => {
        if (!button.disabled) sendMessage(text);
      };
      extras.appendChild(button);
    });

    actions.forEach((cta, index) => {
      const url = safeActionUrl(cta && cta.action);
      const label = cta && typeof cta.label === 'string' ? cta.label.trim() : '';
      if (!url || !label) return;
      const title = cta && cta.metadata && typeof cta.metadata.title === 'string' ? cta.metadata.title.trim() : '';
      const description = cta && cta.metadata && typeof cta.metadata.description === 'string' ? cta.metadata.description.trim() : '';
      if (title || description) {
        const copy = document.createElement('div');
        copy.className = 'chatbot-action-copy';
        if (title) {
          const heading = document.createElement('strong');
          heading.textContent = title.slice(0, 120);
          copy.appendChild(heading);
        }
        if (description) {
          const text = document.createElement('span');
          text.textContent = description.slice(0, 500);
          copy.appendChild(text);
        }
        extras.appendChild(copy);
      }
      const link = document.createElement('a');
      link.className = `chatbot-action ${index > 0 || cta.variant === 'secondary' ? 'secondary' : ''}`;
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = label.slice(0, 100);
      link.setAttribute('aria-label', `${link.textContent} (si apre in una nuova scheda)`);
      extras.appendChild(link);
    });

    if (extras.childElementCount) contentElement.appendChild(extras);
  }

  function addSources(contentElement, sources) {
    if (!Array.isArray(sources) || !sources.length) return;
    const details = document.createElement('details');
    details.className = 'chatbot-sources';
    const summary = document.createElement('summary');
    summary.textContent = `Fonti utilizzate (${Math.min(sources.length, 4)})`;
    details.appendChild(summary);
    const list = document.createElement('div');
    list.className = 'chatbot-source-list';

    sources.slice(0, 4).forEach((source, index) => {
      const rawUrl = source && typeof source.sourceUrl === 'string' ? source.sourceUrl : '';
      const url = safeActionUrl(rawUrl);
      const item = document.createElement(url ? 'a' : 'div');
      item.className = 'chatbot-source';
      if (url && item instanceof HTMLAnchorElement) {
        item.href = url;
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
      }
      const icon = document.createElement('span');
      icon.textContent = rawUrl ? '↗' : '📄';
      const label = document.createElement('span');
      label.textContent =
        source && (source.originalFilename || source.sourceUrl)
          ? source.originalFilename || source.sourceUrl
          : `Fonte ${index + 1}`;
      item.appendChild(icon);
      item.appendChild(label);
      list.appendChild(item);
    });
    details.appendChild(list);
    contentElement.appendChild(details);
  }

  function addFeedbackControls(contentElement, messageId) {
    if (!messageId) return;
    const feedback = document.createElement('div');
    feedback.className = 'chatbot-feedback';
    feedback.setAttribute('aria-label', 'Valuta questa risposta');
    const label = document.createElement('span');
    label.textContent = 'Utile?';
    feedback.appendChild(label);

    ['positive', 'negative'].forEach((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = value === 'positive' ? '👍' : '👎';
      button.setAttribute('aria-label', value === 'positive' ? 'Risposta utile' : 'Risposta non utile');
      button.setAttribute('aria-pressed', 'false');
      button.onclick = async () => {
        const buttons = feedback.querySelectorAll('button');
        buttons.forEach((item) => { item.disabled = true; });
        try {
          await ensureWidgetSession();
          const response = await fetch(`${config.apiUrl}/api/embed/${config.botId}/feedback`, {
            method: 'POST',
            headers: widgetHeaders(),
            body: JSON.stringify({ messageId, feedback: value, userSessionId }),
          });
          if (!response.ok) throw new Error('Feedback non salvato');
          button.setAttribute('aria-pressed', 'true');
          label.textContent = 'Grazie!';
        } catch (error) {
          console.error('Error saving feedback:', error);
          label.textContent = 'Riprova';
          buttons.forEach((item) => { item.disabled = false; });
        }
      };
      feedback.appendChild(button);
    });
    contentElement.appendChild(feedback);
  }

  function addLeadForms(contentElement, forms, activeConversationId) {
    if (!Array.isArray(forms) || !forms.length || !activeConversationId) return;
    const definition = forms[0];
    const form = document.createElement('form');
    form.className = 'chatbot-lead-form';
    const title = document.createElement('h4');
    title.textContent = definition.title || 'Lascia i tuoi contatti';
    const description = document.createElement('p');
    description.textContent = definition.description || 'Ti ricontatteremo al più presto.';
    form.appendChild(title);
    form.appendChild(description);

    const fields = [
      ['name', 'text', 'Nome e cognome', true],
      ['email', 'email', 'Email', false],
      ['phone', 'tel', 'Telefono', false],
      ['company', 'text', 'Azienda (opzionale)', false],
    ];
    fields.forEach(([name, type, placeholder, required]) => {
      const input = document.createElement('input');
      input.name = name;
      input.type = type;
      input.placeholder = placeholder;
      input.maxLength = name === 'email' ? 254 : 120;
      input.required = required;
      input.setAttribute('aria-label', placeholder);
      form.appendChild(input);
    });

    const consentLabel = document.createElement('label');
    consentLabel.className = 'chatbot-lead-consent';
    const consent = document.createElement('input');
    consent.type = 'checkbox';
    consent.name = 'consent';
    consent.required = true;
    const consentText = document.createElement('span');
    consentText.textContent = 'Acconsento a essere ricontattato per questa richiesta.';
    consentLabel.appendChild(consent);
    consentLabel.appendChild(consentText);
    form.appendChild(consentLabel);

    const status = document.createElement('p');
    status.className = 'chatbot-lead-status';
    status.setAttribute('role', 'alert');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'chatbot-lead-submit';
    submit.textContent = String(definition.submitLabel || 'Invia richiesta').slice(0, 80);
    form.appendChild(status);
    form.appendChild(submit);

    form.onsubmit = async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const email = String(values.get('email') || '').trim();
      const phone = String(values.get('phone') || '').trim();
      if (!email && !phone) {
        status.textContent = 'Inserisci almeno email o telefono.';
        return;
      }
      submit.disabled = true;
      status.textContent = '';
      try {
        await ensureWidgetSession();
        const response = await fetch(`${config.apiUrl}/api/embed/${config.botId}/lead`, {
          method: 'POST',
          headers: widgetHeaders(),
          body: JSON.stringify({
            conversationId: activeConversationId,
            userSessionId,
            name: String(values.get('name') || '').trim(),
            email,
            phone,
            company: String(values.get('company') || '').trim(),
            consent: values.get('consent') === 'on',
          }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result && result.error || 'Invio non riuscito');
        const success = document.createElement('div');
        success.className = 'chatbot-lead-success';
        success.textContent = 'Richiesta ricevuta. Ti ricontatteremo presto.';
        form.replaceWith(success);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Invio non riuscito';
        submit.disabled = false;
      }
    };
    contentElement.appendChild(form);
  }

  async function restoreConversation() {
    return syncConversationHistory(true);
  }

  function updateHandoffStatus(data) {
    const active = data && data.needsHumanEscalation && !data.isResolved;
    if (!active) {
      if (handoffStatus) handoffStatus.remove();
      handoffStatus = null;
      return;
    }
    if (!handoffStatus) {
      handoffStatus = document.createElement('div');
      handoffStatus.className = 'chatbot-handoff-status';
    }
    handoffStatus.textContent = data.assignedAgent
      ? `${data.assignedAgent} sta seguendo la conversazione.`
      : 'La conversazione è stata passata a un operatore.';
    messagesContainer.prepend(handoffStatus);
  }

  async function syncConversationHistory(replaceHistory) {
    if (!conversationId) return;
    try {
      await ensureWidgetSession();
      const response = await fetch(
        `${config.apiUrl}/api/embed/${config.botId}/conversations/${conversationId}?sessionId=${encodeURIComponent(userSessionId)}`,
        { headers: widgetHeaders(false) },
      );
      if (response.status === 404) {
        conversationId = null;
        writeStorage(conversationStorageKey, null);
        return;
      }
      if (!response.ok) return;
      const result = await response.json();
      const history = result && result.data && result.data.messages;
      if (!Array.isArray(history) || !history.length) return;
      if (replaceHistory) {
        messagesContainer.replaceChildren();
        messages = [];
        seenMessageIds.clear();
        handoffStatus = null;
      }
      let lastAssistantIndex = -1;
      history.forEach((message, index) => {
        if (message.role === 'assistant') lastAssistantIndex = index;
      });
      history.forEach((message, index) => {
        if (seenMessageIds.has(message.id)) return;
        const sender = message.role === 'assistant' ? 'bot' : 'user';
        const contentElement = addMessage(sender, message.content, { id: message.id });
        if (sender !== 'bot') return;
        addSources(contentElement, message.sources);
        addProductCards(contentElement, message.productCards, message.id, message.productWidget);
        if (!message.feedback) addFeedbackControls(contentElement, message.id);
        if (index === lastAssistantIndex) {
          addResponseExtras(contentElement, message.quickReplies, message.ctas);
        }
      });
      updateHandoffStatus(result.data);
    } catch (error) {
      console.error('Error restoring conversation:', error);
    }
  }

  function startHistoryPolling() {
    stopHistoryPolling();
    if (!isOpen || !conversationId) return;
    historyPollTimer = window.setInterval(
      () => syncConversationHistory(false),
      5000,
    );
  }

  function stopHistoryPolling() {
    if (historyPollTimer) window.clearInterval(historyPollTimer);
    historyPollTimer = null;
  }

  function widgetHeaders(includeContentType = true) {
    return {
      ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
      'X-LitX-Widget-Session': signedSessionToken,
    };
  }

  async function ensureWidgetSession(force = false) {
    if (!force && userSessionId && signedSessionToken) return;
    if (!force && sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const response = await fetch(`${config.apiUrl}/api/embed/${config.botId}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || !result.data) {
        throw new Error(result && result.error || 'Sessione widget non disponibile');
      }
      userSessionId = result.data.sessionId;
      signedSessionToken = result.data.token;
      conversationId = null;
      writeStorage(sessionStorageKey, userSessionId);
      writeStorage(sessionTokenStorageKey, signedSessionToken);
      writeStorage(conversationStorageKey, null);
    })();
    try {
      await sessionPromise;
    } finally {
      sessionPromise = null;
    }
  }

  function showTyping() {
    const typingElement = document.createElement('div');
    typingElement.className = 'chatbot-message bot';
    typingElement.innerHTML = `
      <div class="chatbot-typing">
        <div class="chatbot-typing-dot"></div>
        <div class="chatbot-typing-dot"></div>
        <div class="chatbot-typing-dot"></div>
      </div>
    `;
    typingElement.id = 'typing-indicator';
    messagesContainer.appendChild(typingElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function hideTyping() {
    const typing = document.getElementById('typing-indicator');
    if (typing) {
      typing.remove();
    }
  }

  // API Functions
  function chatRequestBody(message, requestedConversationId) {
    return JSON.stringify({
      message,
      botId: config.botId,
      conversationId: requestedConversationId,
      userSessionId,
      source: 'widget',
      pageContext: collectPageContext(),
    });
  }

  async function sendMessage(content, options) {
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent || normalizedContent.length > 4000 || messageInFlight) return false;
    messageInFlight = true;
    stopHistoryPolling();
    try {
      await restorePromise;
    } catch {
      messageInFlight = false;
      addMessage('bot', 'Sessione non disponibile. Ricarica la pagina e riprova.', { error: true });
      return false;
    }
    disablePendingReplies();
    // Add user message
    const userContent = addMessage('user', options && options.privateEntry ? '[Dati ordine inviati in modo protetto]' : normalizedContent);
    
    // Show typing
    showTyping();
    
    // Disable input
    const input = inputContainer.querySelector('.chatbot-input');
    const sendButton = inputContainer.querySelector('.chatbot-send');
    input.disabled = true;
    sendButton.disabled = true;

    try {
      await ensureWidgetSession();
      let response = await fetch(`${config.apiUrl}/api/chat`, {
        method: 'POST',
        headers: widgetHeaders(),
        body: chatRequestBody(normalizedContent, conversationId)
      });
      if (response.status === 401) {
        await ensureWidgetSession(true);
        response = await fetch(`${config.apiUrl}/api/chat`, {
          method: 'POST',
          headers: widgetHeaders(),
          body: chatRequestBody(normalizedContent, null)
        });
      } else if (response.status === 404 && conversationId) {
        conversationId = null;
        writeStorage(conversationStorageKey, null);
        response = await fetch(`${config.apiUrl}/api/chat`, {
          method: 'POST',
          headers: widgetHeaders(),
          body: chatRequestBody(normalizedContent, null)
        });
      }

      if (response.ok) {
        const data = await response.json();
        
        // Hide typing
        hideTyping();
        
        // Add bot response
        if (data.data.userMessage && data.data.userMessage.id) {
          seenMessageIds.add(data.data.userMessage.id);
          const userMessageElement = userContent.closest('.chatbot-message');
          if (userMessageElement) userMessageElement.dataset.messageId = data.data.userMessage.id;
        }
        const responseContent = addMessage('bot', data.data.assistantMessage.content, {
          id: data.data.assistantMessage.id,
        });
        addSources(responseContent, data.data.sources);
        addProductCards(responseContent, data.data.productCards, data.data.assistantMessage.id, data.data.productWidget);
        addOrderLookupForm(responseContent, data.data.orderLookupForm);
        addOrderStatusCard(responseContent, data.data.orderStatusCard);
        addFeedbackControls(responseContent, data.data.assistantMessage.id);
        addResponseExtras(responseContent, data.data.quickReplies, data.data.ctas);
        addLeadForms(responseContent, data.data.actions && data.data.actions.leadForms, data.data.conversationId);
        
        // Update conversation ID if needed
        if (data.data.conversationId && !conversationId) {
          conversationId = data.data.conversationId;
          writeStorage(conversationStorageKey, conversationId);
          startHistoryPolling();
        }
      } else {
        let failure = null;
        try { failure = await response.json(); } catch {}
        throw new Error(failure && (failure.message || failure.error) || 'Risposta non disponibile');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      hideTyping();
      const detail = error instanceof Error && error.message !== 'Failed to fetch'
        ? error.message
        : 'Connessione non disponibile. Controlla la rete e riprova.';
      addMessage('bot', detail, { error: true });
    } finally {
      // Re-enable input
      input.disabled = false;
      sendButton.disabled = false;
      messageInFlight = false;
      if (isOpen && conversationId) startHistoryPolling();
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
        input.focus({ preventScroll: true });
      }
    }
    return true;
  }

  // Public API
  window.ChatbotWidget = {
    open: openChat,
    close: closeChat,
    toggle: toggleChat,
    sendMessage: sendMessage,
    addMessage: addMessage,
    refresh: () => syncConversationHistory(false),
    isOpen: () => isOpen,
    isLoaded: () => isLoaded
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget, { once: true });
  } else {
    createWidget();
  }

})();

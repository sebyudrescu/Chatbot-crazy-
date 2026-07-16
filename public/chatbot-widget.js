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
    autoOpen: false,
    showLauncher: true,
    customCSS: null,
    widgetShape: 'circle',
    iconValue: '💬',
    widgetSize: 'medium',
    animation: true,
    shadow: true,
    gradient: true
  };

  // Merge configurazione utente
  const config = Object.assign({}, DEFAULT_CONFIG, window.ChatbotConfig || {});
  const launcherSize = config.widgetSize === 'small' ? 50 : config.widgetSize === 'large' ? 70 : 60;
  const launcherRadius = config.widgetShape === 'circle' ? '50%' : config.widgetShape === 'square' ? '8px' : '18px';

  if (!config.botId) {
    console.error('ChatBot Widget: botId is required');
    return;
  }

  // Stato del widget
  let isOpen = false;
  let isLoaded = false;
  let messages = [];
  let conversationId = null;

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
      ${config.position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
      ${config.position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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

    .chatbot-message-content {
      max-width: 84%;
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

    .chatbot-input-container {
      padding: 16px;
      border-top: 1px solid ${config.theme === 'dark' ? '#4a5568' : '#e2e8f0'};
      background: ${config.theme === 'dark' ? '#2d3748' : 'white'};
    }

    .chatbot-input-form {
      display: flex;
      gap: 8px;
    }

    .chatbot-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid ${config.theme === 'dark' ? '#4a5568' : '#e2e8f0'};
      border-radius: 20px;
      background: ${config.theme === 'dark' ? '#1a202c' : '#f7fafc'};
      color: ${config.theme === 'dark' ? 'white' : '#2d3748'};
      font-size: 14px;
      outline: none;
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
      .chatbot-window {
        width: calc(100vw - 40px);
        height: calc(100vh - 120px);
        bottom: 80px;
        left: 20px !important;
        right: 20px !important;
      }
    }

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
      if (message) {
        sendMessage(message);
        input.value = '';
      }
    };

    chatWindow.appendChild(inputContainer);
    widgetContainer.appendChild(chatWindow);

    // Add to page
    document.body.appendChild(widgetContainer);

    // Auto open if configured
    if (config.autoOpen) {
      setTimeout(openChat, 1000);
    }

    // Initial message
    if (!config.autoOpen) {
      addMessage('bot', `Ciao! Sono ${config.title}. ${config.subtitle}`);
    }

    isLoaded = true;
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
    
    if (launcher) {
      launcher.style.display = 'none';
      launcher.setAttribute('aria-expanded', 'true');
    }

    // Focus input
    const input = inputContainer.querySelector('.chatbot-input');
    setTimeout(() => input.focus(), 300);

  }

  function closeChat() {
    if (!isLoaded) return;
    
    isOpen = false;
    chatWindow.classList.remove('open');
    
    if (launcher) {
      launcher.style.display = 'flex';
      launcher.setAttribute('aria-expanded', 'false');
    }
  }

  function addMessage(sender, content, options) {
    const messageElement = document.createElement('div');
    messageElement.className = `chatbot-message ${sender}`;
    const contentElement = document.createElement('div');
    contentElement.className = 'chatbot-message-content';
    const bubble = document.createElement('div');
    bubble.className = 'chatbot-message-bubble';
    if (options && options.error) bubble.classList.add('chatbot-error');
    bubble.textContent = content;
    contentElement.appendChild(bubble);
    messageElement.appendChild(contentElement);
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store message
    messages.push({ sender, content, timestamp: new Date() });
    return contentElement;
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
          const response = await fetch(`${config.apiUrl}/api/embed/${config.botId}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId, feedback: value }),
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
  async function sendMessage(content) {
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent || normalizedContent.length > 4000) return;
    disablePendingReplies();
    // Add user message
    addMessage('user', normalizedContent);
    
    // Show typing
    showTyping();
    
    // Disable input
    const input = inputContainer.querySelector('.chatbot-input');
    const sendButton = inputContainer.querySelector('.chatbot-send');
    input.disabled = true;
    sendButton.disabled = true;

    try {
      const response = await fetch(`${config.apiUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: normalizedContent,
          botId: config.botId,
          conversationId: conversationId,
          source: 'widget'
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Hide typing
        hideTyping();
        
        // Add bot response
        const responseContent = addMessage('bot', data.data.assistantMessage.content);
        addFeedbackControls(responseContent, data.data.assistantMessage.id);
        addResponseExtras(responseContent, data.data.quickReplies, data.data.ctas);
        
        // Update conversation ID if needed
        if (data.data.conversationId && !conversationId) {
          conversationId = data.data.conversationId;
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
      input.focus();
    }
  }

  // Public API
  window.ChatbotWidget = {
    open: openChat,
    close: closeChat,
    toggle: toggleChat,
    sendMessage: sendMessage,
    addMessage: addMessage,
    isOpen: () => isOpen,
    isLoaded: () => isLoaded
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }

})();

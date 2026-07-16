/**
 * Chatbot Widget Embed Script
 * Versione: 1.0.0
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
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 18px;
      word-wrap: break-word;
      line-height: 1.4;
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

  function generateId() {
    return Math.random().toString(36).substr(2, 9);
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
      launcher.textContent = config.iconValue || '💬';
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
        <h3>${config.title}</h3>
        <p>${config.subtitle}</p>
      </div>
      <button class="chatbot-close">✕</button>
    `;
    header.querySelector('.chatbot-close').onclick = closeChat;
    chatWindow.appendChild(header);

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
        />
        <button type="submit" class="chatbot-send">
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
      addMessage('bot', 'Ciao! Come posso aiutarti oggi?');
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
    }

    // Focus input
    const input = inputContainer.querySelector('.chatbot-input');
    setTimeout(() => input.focus(), 300);

    // Initialize conversation
    if (!conversationId) {
      initializeConversation();
    }
  }

  function closeChat() {
    if (!isLoaded) return;
    
    isOpen = false;
    chatWindow.classList.remove('open');
    
    if (launcher) {
      launcher.style.display = 'flex';
    }
  }

  function addMessage(sender, content) {
    const messageElement = document.createElement('div');
    messageElement.className = `chatbot-message ${sender}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'chatbot-message-bubble';
    bubble.textContent = content;
    
    messageElement.appendChild(bubble);
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store message
    messages.push({ sender, content, timestamp: new Date() });
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
  async function initializeConversation() {
    try {
      const response = await fetch(`${config.apiUrl}/api/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botId: config.botId,
          userSessionId: `widget_${Date.now()}_${Math.random().toString(36).slice(2)}`
        })
      });

      if (response.ok) {
        const data = await response.json();
        conversationId = data.data.id;
      }
    } catch (error) {
      console.error('Failed to initialize conversation:', error);
    }
  }

  async function sendMessage(content) {
    // Add user message
    addMessage('user', content);
    
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
          message: content,
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
        addMessage('bot', data.data.assistantMessage.content);
        
        // Update conversation ID if needed
        if (data.data.conversationId && !conversationId) {
          conversationId = data.data.conversationId;
        }
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      hideTyping();
      addMessage('bot', 'Mi dispiace, si è verificato un errore. Riprova più tardi.');
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

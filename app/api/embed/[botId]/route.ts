import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/embed/[botId] - Serve widget configuration
export async function GET(request: NextRequest, props: { params: Promise<{ botId: string }> }) {
  const params = await props.params;
  try {
    const { botId } = params;
    
    // Get chatbot configuration
    const chatbot = await prisma.chatbot.findUnique({
      where: { id: botId },
      include: {
        embedSettings: true
      }
    });

    if (!chatbot) {
      return NextResponse.json(
        { error: 'Chatbot not found' },
        { status: 404 }
      );
    }

    if (!chatbot.isActive) {
      return NextResponse.json(
        { error: 'Agent not published' },
        { status: 403 }
      );
    }

    // Check if embedding is enabled
    if (!chatbot.embedSettings?.enabled) {
      return NextResponse.json(
        { error: 'Embedding not enabled for this chatbot' },
        { status: 403 }
      );
    }

    // Return widget configuration
    const config = {
      botId: chatbot.id,
      title: chatbot.embedSettings?.title || chatbot.companyName,
      subtitle: chatbot.embedSettings.subtitle || 'Come posso aiutarti?',
      theme: chatbot.embedSettings.theme || 'light',
      position: chatbot.embedSettings.position || 'bottom-right',
      primaryColor: chatbot.embedSettings.primaryColor || '#007bff',
      secondaryColor: chatbot.embedSettings.secondaryColor || '#825cff',
      launcherColor: chatbot.embedSettings.launcherColor || chatbot.embedSettings.primaryColor || '#007bff',
      brandLogoUrl: chatbot.embedSettings.brandLogoUrl || null,
      autoOpen: chatbot.embedSettings.autoOpen || false,
      showLauncher: chatbot.embedSettings.showLauncher !== false,
      launcherMessageEnabled: chatbot.embedSettings.launcherMessageEnabled,
      launcherMessage: chatbot.embedSettings.launcherMessage || null,
      launcherMessageDelay: chatbot.embedSettings.launcherMessageDelay,
      launcherMessageDuration: chatbot.embedSettings.launcherMessageDuration,
      widgetShape: chatbot.embedSettings.widgetShape,
      iconType: chatbot.embedSettings.iconType,
      iconValue: chatbot.embedSettings.iconValue,
      widgetSize: chatbot.embedSettings.widgetSize,
      animation: chatbot.embedSettings.animation,
      shadow: chatbot.embedSettings.shadow,
      gradient: chatbot.embedSettings.gradient,
      customCSS: chatbot.embedSettings.customCSS || null
    };

    // Check domain restrictions
    const origin = request.headers.get('origin');
    if (chatbot.embedSettings.allowedDomains && origin) {
      const allowedDomains = chatbot.embedSettings.allowedDomains.split(/[\n,]/).map(d => d.trim()).filter(Boolean);
      const originHost = new URL(origin).hostname.toLowerCase();
      
      const isAllowed = allowedDomains.some(domain => {
        if (domain === '*') return true;
        const normalized = domain.replace(/^\*\./, '').replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
        return originHost === normalized || originHost.endsWith(`.${normalized}`);
      });

      if (!isAllowed) {
        return NextResponse.json(
          { error: 'Domain not allowed' },
          { status: 403 }
        );
      }
    }

    // Set CORS headers
    const response = NextResponse.json(config);
    response.headers.set('Access-Control-Allow-Origin', origin || '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    
    return response;

  } catch (error) {
    console.error('Error serving widget config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// OPTIONS - Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', origin || '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  
  return response;
}

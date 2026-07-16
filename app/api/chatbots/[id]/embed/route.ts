import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/chatbots/[id]/embed - Get embed settings
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;

    const chatbot = await prisma.chatbot.findUnique({
      where: { id },
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

    return NextResponse.json({
      id: chatbot.id,
      name: chatbot.companyName,
      embedSettings: chatbot.embedSettings
    });

  } catch (error) {
    console.error('Error fetching embed settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/chatbots/[id]/embed - Update embed settings
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;
    const settings = await request.json();

    // Update or create embed settings
    const embedSettings = await prisma.embedSettings.upsert({
      where: { chatbotId: id },
      update: {
        enabled: settings.enabled,
        title: settings.title,
        subtitle: settings.subtitle,
        theme: settings.theme,
        position: settings.position,
        primaryColor: settings.primaryColor,
        autoOpen: settings.autoOpen,
        showLauncher: settings.showLauncher,
        customCSS: settings.customCSS,
        allowedDomains: settings.allowedDomains,
        widgetShape: settings.widgetShape,
        iconType: settings.iconType,
        iconValue: settings.iconValue,
        widgetSize: settings.widgetSize,
        animation: settings.animation,
        shadow: settings.shadow,
        gradient: settings.gradient
      },
      create: {
        chatbotId: id,
        enabled: settings.enabled,
        title: settings.title,
        subtitle: settings.subtitle,
        theme: settings.theme,
        position: settings.position,
        primaryColor: settings.primaryColor,
        autoOpen: settings.autoOpen,
        showLauncher: settings.showLauncher,
        customCSS: settings.customCSS,
        allowedDomains: settings.allowedDomains,
        widgetShape: settings.widgetShape,
        iconType: settings.iconType,
        iconValue: settings.iconValue,
        widgetSize: settings.widgetSize,
        animation: settings.animation,
        shadow: settings.shadow,
        gradient: settings.gradient
      }
    });

    return NextResponse.json(embedSettings);

  } catch (error) {
    console.error('Error updating embed settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

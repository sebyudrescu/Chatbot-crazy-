import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const EmbedSettingsSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(300),
  theme: z.enum(['light', 'dark']),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  autoOpen: z.boolean(),
  showLauncher: z.boolean(),
  customCSS: z.string().max(50_000),
  allowedDomains: z.string().max(5_000),
  widgetShape: z.enum(['circle', 'rounded', 'square']),
  iconType: z.enum(['emoji', 'logo', 'icon']),
  iconValue: z.string().max(2_000),
  widgetSize: z.enum(['small', 'medium', 'large']),
  animation: z.boolean(),
  shadow: z.boolean(),
  gradient: z.boolean(),
});

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
    const settings = EmbedSettingsSchema.parse(await request.json());

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
      { error: error instanceof z.ZodError ? 'Impostazioni widget non valide' : 'Internal server error' },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}

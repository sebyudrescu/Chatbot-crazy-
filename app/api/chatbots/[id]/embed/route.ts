import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth';

const OptionalHttpsUrlSchema = z.union([
  z.literal(''),
  z.string().trim().url().max(2_000).refine(value => new URL(value).protocol === 'https:', 'Il logo deve usare HTTPS'),
]);

const EmbedSettingsSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(300),
  theme: z.enum(['light', 'dark']),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#825cff'),
  launcherColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#633cff'),
  brandLogoUrl: OptionalHttpsUrlSchema.default(''),
  autoOpen: z.boolean(),
  showLauncher: z.boolean(),
  launcherMessageEnabled: z.boolean().default(false),
  launcherMessage: z.string().trim().max(160).default(''),
  launcherMessageDelay: z.number().int().min(0).max(30_000).default(1_500),
  launcherMessageDuration: z.number().int().min(0).max(60_000).default(12_000),
  customCSS: z.string().max(50_000),
  allowedDomains: z.string().max(5_000),
  widgetShape: z.enum(['circle', 'rounded', 'square']),
  iconType: z.enum(['emoji', 'logo', 'icon']),
  iconValue: z.string().max(2_000),
  widgetSize: z.enum(['small', 'medium', 'large']),
  animation: z.boolean(),
  shadow: z.boolean(),
  gradient: z.boolean(),
}).superRefine((settings, context) => {
  if (settings.iconType !== 'logo') return;
  try {
    if (new URL(settings.iconValue).protocol === 'https:') return;
  } catch {}
  context.addIssue({ code: z.ZodIssueCode.custom, path: ['iconValue'], message: 'Il logo del launcher deve usare HTTPS' });
});

// GET /api/chatbots/[id]/embed - Get embed settings
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, id, 'chatbot.read');

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
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
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
    const actor = await requireDashboardActor(request);
    await requireBotPermission(actor, id, 'chatbot.write');
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
        secondaryColor: settings.secondaryColor,
        launcherColor: settings.launcherColor,
        brandLogoUrl: settings.brandLogoUrl || null,
        autoOpen: settings.autoOpen,
        showLauncher: settings.showLauncher,
        launcherMessageEnabled: settings.launcherMessageEnabled,
        launcherMessage: settings.launcherMessage || null,
        launcherMessageDelay: settings.launcherMessageDelay,
        launcherMessageDuration: settings.launcherMessageDuration,
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
        secondaryColor: settings.secondaryColor,
        launcherColor: settings.launcherColor,
        brandLogoUrl: settings.brandLogoUrl || null,
        autoOpen: settings.autoOpen,
        showLauncher: settings.showLauncher,
        launcherMessageEnabled: settings.launcherMessageEnabled,
        launcherMessage: settings.launcherMessage || null,
        launcherMessageDelay: settings.launcherMessageDelay,
        launcherMessageDuration: settings.launcherMessageDuration,
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
    const authResponse = dashboardAuthErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Error updating embed settings:', error);
    return NextResponse.json(
      { error: error instanceof z.ZodError ? 'Impostazioni widget non valide' : 'Internal server error' },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { 
  getAllTemplates, 
  getTemplateById, 
  getTemplatesByCategory,
  getTemplateCategories,
  fillTemplatePlaceholders 
} from '@/lib/prompt-templates'
import { dashboardAuthErrorResponse, requireDashboardActor } from '@/lib/workspace-auth'

/**
 * GET /api/prompt-templates - Get all available prompt templates
 * Query params:
 * - category: Filter by category (optional)
 * - id: Get specific template by ID (optional)
 */
export async function GET(request: NextRequest) {
  try {
    await requireDashboardActor(request)
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category')
    const id = searchParams.get('id')

    // Get specific template by ID
    if (id) {
      const template = getTemplateById(id)
      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ success: true, data: template })
    }

    // Get templates by category
    if (category) {
      const templates = getTemplatesByCategory(category)
      return NextResponse.json({ success: true, data: templates })
    }

    // Get all templates with categories
    const templates = getAllTemplates()
    const categories = getTemplateCategories()

    return NextResponse.json({
      success: true,
      data: {
        templates,
        categories,
        totalCount: templates.length,
      },
    })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Error fetching prompt templates:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch prompt templates' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/prompt-templates/preview - Preview a template with filled placeholders
 * Body: { templateId: string, variables: Record<string, string> }
 */
export async function POST(request: NextRequest) {
  try {
    await requireDashboardActor(request)
    const body = await request.json()
    const { templateId, variables } = body

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'Template ID is required' },
        { status: 400 }
      )
    }

    const template = getTemplateById(templateId)
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      )
    }

    // Fill placeholders if variables provided
    const filledPrompt = variables 
      ? fillTemplatePlaceholders(template.systemPrompt, variables)
      : template.systemPrompt

    return NextResponse.json({
      success: true,
      data: {
        template,
        filledPrompt,
        placeholders: template.placeholders || [],
      },
    })
  } catch (error) {
    const authResponse = dashboardAuthErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Error previewing template:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to preview template' },
      { status: 500 }
    )
  }
}

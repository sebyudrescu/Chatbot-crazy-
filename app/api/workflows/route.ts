import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { WorkflowFieldsSchema, validateWorkflowDefinition } from '@/lib/workflow-schema'
import { decryptConfigSecrets, encryptConfigSecrets, redactSecrets } from '@/lib/secret-config'
import { assertSafeRemoteUrl } from '@/lib/url-safety'
import { accessibleBotIds, dashboardAuthErrorResponse, requireBotPermission, requireDashboardActor } from '@/lib/workspace-auth'

export async function GET(request:NextRequest){
  try { const actor=await requireDashboardActor(request);const botId=request.nextUrl.searchParams.get('botId');if(botId)await requireBotPermission(actor,botId,'chatbot.read');const ids=botId?null:await accessibleBotIds(actor,'chatbot.read');const workflows=await prisma.workflow.findMany({where:botId?{botId}:ids===null?undefined:{botId:{in:ids}},include:{chatbot:{select:{id:true,companyName:true}},executions:{orderBy:{createdAt:'desc'},take:10}},orderBy:{updatedAt:'desc'}});return NextResponse.json({success:true,data:workflows.map(item=>({...item,steps:redactSecrets(decryptConfigSecrets(JSON.parse(item.steps))),executions:item.executions.map(execution=>({...execution,actions:JSON.parse(execution.actions)}))}))}) }
  catch(error){const authResponse=dashboardAuthErrorResponse(error);if(authResponse)return authResponse;return NextResponse.json({success:false,error:'Impossibile caricare i workflow'},{status:500})}
}
export async function POST(request:NextRequest){
  try{const actor=await requireDashboardActor(request);const data=WorkflowFieldsSchema.parse(await request.json());await requireBotPermission(actor,data.botId,'chatbot.write');validateWorkflowDefinition(data);for(const step of data.steps)if(step.type==='webhook')await assertSafeRemoteUrl(String(step.config.url));const workflow=await prisma.workflow.create({data:{...data,steps:JSON.stringify(encryptConfigSecrets(data.steps))}});return NextResponse.json({success:true,data:{...workflow,steps:redactSecrets(data.steps),executions:[]}},{status:201})}
  catch(error){const authResponse=dashboardAuthErrorResponse(error);if(authResponse)return authResponse;return NextResponse.json({success:false,error:error instanceof Error?error.message:'Invalid workflow'},{status:400})}
}

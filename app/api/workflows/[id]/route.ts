import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { WorkflowFieldsSchema, validateWorkflowDefinition } from '@/lib/workflow-schema'
import { decryptConfigSecrets, encryptConfigSecrets, redactSecrets, restoreMaskedSecrets } from '@/lib/secret-config'
import { assertSafeRemoteUrl } from '@/lib/url-safety'
import { dashboardAuthErrorResponse, requireDashboardActor, requireResourcePermission } from '@/lib/workspace-auth'

const UpdateSchema=WorkflowFieldsSchema.partial()
export async function GET(request:NextRequest, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  try{const actor=await requireDashboardActor(request);await requireResourcePermission(actor,'workflow',params.id,'chatbot.read');const item=await prisma.workflow.findUnique({where:{id:params.id},include:{chatbot:{select:{id:true,companyName:true}},executions:{orderBy:{createdAt:'desc'},take:10}}});if(!item)return NextResponse.json({success:false,error:'Workflow not found'},{status:404});return NextResponse.json({success:true,data:{...item,steps:redactSecrets(decryptConfigSecrets(JSON.parse(item.steps))),executions:item.executions.map(execution=>({...execution,actions:JSON.parse(execution.actions)}))}})}catch(error){const authResponse=dashboardAuthErrorResponse(error);if(authResponse)return authResponse;return NextResponse.json({success:false,error:'Workflow non disponibile'},{status:500})}
}
export async function PATCH(request:NextRequest, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  try{const actor=await requireDashboardActor(request);await requireResourcePermission(actor,'workflow',params.id,'chatbot.write');const current=await prisma.workflow.findUnique({where:{id:params.id}});if(!current)return NextResponse.json({success:false,error:'Workflow not found'},{status:404});const data=UpdateSchema.parse(await request.json());const currentSteps=decryptConfigSecrets(JSON.parse(current.steps));const nextSteps=data.steps?restoreMaskedSecrets(data.steps,currentSteps):currentSteps;const validated=WorkflowFieldsSchema.parse({botId:current.botId,name:data.name??current.name,description:data.description===undefined?current.description:data.description,triggerType:data.triggerType??current.triggerType,steps:nextSteps,isActive:data.isActive??current.isActive});validateWorkflowDefinition(validated);for(const step of validated.steps)if(step.type==='webhook')await assertSafeRemoteUrl(String(step.config.url));const {steps,botId:_botId,...fields}=data;const item=await prisma.workflow.update({where:{id:params.id},data:{...fields,...(steps?{steps:JSON.stringify(encryptConfigSecrets(nextSteps))}:{})}});return NextResponse.json({success:true,data:{...item,steps:redactSecrets(decryptConfigSecrets(JSON.parse(item.steps)))}})}catch(error){const authResponse=dashboardAuthErrorResponse(error);if(authResponse)return authResponse;return NextResponse.json({success:false,error:error instanceof Error?error.message:'Update failed'},{status:400})}
}
export async function DELETE(request:NextRequest, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  try{const actor=await requireDashboardActor(request);await requireResourcePermission(actor,'workflow',params.id,'chatbot.write');await prisma.workflow.delete({where:{id:params.id}});return NextResponse.json({success:true})}catch(error){const authResponse=dashboardAuthErrorResponse(error);if(authResponse)return authResponse;return NextResponse.json({success:false,error:'Eliminazione non riuscita'},{status:400})}
}

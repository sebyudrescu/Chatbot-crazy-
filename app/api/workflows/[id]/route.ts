import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { WorkflowFieldsSchema, validateWorkflowDefinition } from '@/lib/workflow-schema'
import { decryptConfigSecrets, encryptConfigSecrets, redactSecrets, restoreMaskedSecrets } from '@/lib/secret-config'
import { assertSafeRemoteUrl } from '@/lib/url-safety'

const UpdateSchema=WorkflowFieldsSchema.partial()
export async function GET(_:NextRequest, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  const item=await prisma.workflow.findUnique({where:{id:params.id},include:{chatbot:{select:{id:true,companyName:true}},executions:{orderBy:{createdAt:'desc'},take:10}}});if(!item)return NextResponse.json({success:false,error:'Workflow not found'},{status:404});return NextResponse.json({success:true,data:{...item,steps:redactSecrets(decryptConfigSecrets(JSON.parse(item.steps))),executions:item.executions.map(execution=>({...execution,actions:JSON.parse(execution.actions)}))}})
}
export async function PATCH(request:NextRequest, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  try{const current=await prisma.workflow.findUnique({where:{id:params.id}});if(!current)return NextResponse.json({success:false,error:'Workflow not found'},{status:404});const data=UpdateSchema.parse(await request.json());const currentSteps=decryptConfigSecrets(JSON.parse(current.steps));const nextSteps=data.steps?restoreMaskedSecrets(data.steps,currentSteps):currentSteps;const validated=WorkflowFieldsSchema.parse({botId:data.botId??current.botId,name:data.name??current.name,description:data.description===undefined?current.description:data.description,triggerType:data.triggerType??current.triggerType,steps:nextSteps,isActive:data.isActive??current.isActive});validateWorkflowDefinition(validated);for(const step of validated.steps)if(step.type==='webhook')await assertSafeRemoteUrl(String(step.config.url));const {steps,...fields}=data;const item=await prisma.workflow.update({where:{id:params.id},data:{...fields,...(steps?{steps:JSON.stringify(encryptConfigSecrets(nextSteps))}:{})}});return NextResponse.json({success:true,data:{...item,steps:redactSecrets(decryptConfigSecrets(JSON.parse(item.steps)))}})}catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Update failed'},{status:400})}
}
export async function DELETE(_:NextRequest, props:{params: Promise<{id:string}>}) {
  const params = await props.params;
  await prisma.workflow.delete({where:{id:params.id}});return NextResponse.json({success:true})
}

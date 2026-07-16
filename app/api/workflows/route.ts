import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { WorkflowFieldsSchema, validateWorkflowDefinition } from '@/lib/workflow-schema'
import { redactSecrets } from '@/lib/secret-config'
import { assertSafeRemoteUrl } from '@/lib/url-safety'

export async function GET(request:NextRequest){
  const botId=request.nextUrl.searchParams.get('botId')
  const workflows=await prisma.workflow.findMany({where:botId?{botId}:undefined,include:{chatbot:{select:{id:true,companyName:true}},executions:{orderBy:{createdAt:'desc'},take:10}},orderBy:{updatedAt:'desc'}})
  return NextResponse.json({success:true,data:workflows.map(item=>({...item,steps:redactSecrets(JSON.parse(item.steps)),executions:item.executions.map(execution=>({...execution,actions:JSON.parse(execution.actions)}))}))})
}
export async function POST(request:NextRequest){
  try{const data=WorkflowFieldsSchema.parse(await request.json());validateWorkflowDefinition(data);for(const step of data.steps)if(step.type==='webhook')await assertSafeRemoteUrl(String(step.config.url));const workflow=await prisma.workflow.create({data:{...data,steps:JSON.stringify(data.steps)}});return NextResponse.json({success:true,data:{...workflow,steps:redactSecrets(data.steps),executions:[]}},{status:201})}
  catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'Invalid workflow'},{status:400})}
}

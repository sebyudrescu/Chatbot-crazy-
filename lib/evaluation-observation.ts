export function buildConversationQualityObservation(data: any) {
  const traceTools = Array.isArray(data?.evaluationTrace?.tools)
    ? data.evaluationTrace.tools
      .filter((tool: any) => tool?.success && typeof tool.name === "string")
      .map((tool: any) => tool.name)
    : [];
  const fallbackTools = Array.isArray(data?.decision?.sources)
    ? data.decision.sources.filter((tool: unknown): tool is string => typeof tool === "string")
    : [];
  const productIds = Array.isArray(data?.productCards)
    ? data.productCards
      .map((card: any) => card?.productId)
      .filter((id: unknown): id is string => typeof id === "string")
    : [];
  return {
    intent: typeof data?.intent?.type === "string" ? data.intent.type : null,
    tools: traceTools.length ? traceTools : fallbackTools,
    productIds,
    cardsShown: productIds.length,
    rememberedSlots: data?.evaluationTrace?.rememberedSlots && typeof data.evaluationTrace.rememberedSlots === "object"
      ? data.evaluationTrace.rememberedSlots
      : {},
  };
}

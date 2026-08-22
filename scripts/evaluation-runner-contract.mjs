export function evaluationMessages(test) {
  const previous = Array.isArray(test?.conversationTurns)
    ? test.conversationTurns.filter(message => typeof message === 'string' && message.trim())
    : []
  return [...previous, test.question]
}

export function conversationQualityRequest(test, data) {
  if (!test?.qualityContract) return {}
  const traceTools = Array.isArray(data?.evaluationTrace?.tools)
    ? data.evaluationTrace.tools
      .filter(tool => tool?.success && typeof tool.name === 'string')
      .map(tool => tool.name)
    : []
  const fallbackTools = Array.isArray(data?.decision?.sources)
    ? data.decision.sources.filter(source => typeof source === 'string')
    : []
  const productIds = Array.isArray(data?.productCards)
    ? data.productCards.map(card => card?.productId).filter(id => typeof id === 'string')
    : []
  return {
    conversationQuality: {
      contract: test.qualityContract,
      observation: {
        intent: typeof data?.intent?.type === 'string' ? data.intent.type : null,
        tools: traceTools.length ? traceTools : fallbackTools,
        productIds,
        cardsShown: productIds.length,
        rememberedSlots: data?.evaluationTrace?.rememberedSlots && typeof data.evaluationTrace.rememberedSlots === 'object'
          ? data.evaluationTrace.rememberedSlots
          : {},
      },
    },
  }
}

# 🎯 DECISION TRACING - ESEMPI PRATICI

Questo documento mostra esempi reali di come usare il Decision Tracing per debugging e ottimizzazione.

---

## 📋 QUICK START

### 1. **Trova un messaggio recente**

```bash
# Apri Prisma Studio
npx prisma studio

# Vai su "messages" table
# Copia un messageId di un assistant message recente
```

### 2. **Visualizza la trace**

```bash
# Metodo 1: CLI (consigliato per debug rapido)
npx ts-node scripts/trace-decision.ts msg-abc123

# Metodo 2: API (per integrazioni)
curl http://localhost:3000/api/decisions/msg-abc123/trace

# Metodo 3: Browser (per vedere JSON)
http://localhost:3000/api/decisions/msg-abc123/trace
```

### 3. **Analizza conversazione completa**

```bash
# CLI (summary)
npx ts-node scripts/trace-decision.ts --conversation conv-xyz789

# API (full detail)
curl http://localhost:3000/api/conversations/conv-xyz789/trace
```

---

## 🔍 CASO D'USO 1: Bot Risponde Male

### **Problema**
User: "Il bot mi ha dato una risposta sbagliata quando ho chiesto X"

### **Soluzione (30 secondi)**

```bash
# Step 1: Ottieni messageId dall'utente o da DB
MESSAGE_ID="msg-problematic-123"

# Step 2: Trace
npx ts-node scripts/trace-decision.ts $MESSAGE_ID
```

### **Output Esempio**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 DECISION TRACE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Query: "What is your pricing for the premium plan?"

🧠 UNDERSTANDING
   Intent: question (confidence: 82%)
   Query Type: factual (simple)
   Entities: premium plan

🎯 DECISION
   Strategy: rag_enhanced
   Why: Factual query requiring knowledge base lookup
   Confidence: 48% ⚠️
   
   Alternatives considered:
   ✓ rag_enhanced (score: 80%) - CHOSEN
   ✗ graph_reasoning (score: 65%) - No graph entities
   ✗ memory_personalized (score: 30%) - No user history

🔍 RETRIEVAL
   ✗ knowledge_base: 0 results ⚠️
      → Not included or no matches found
   ✗ persistent_memory: No relevant facts
   ✓ context: Conversation context included

⚠️ ISSUES
   🚨 No relevant information found
      💡 Query may be outside knowledge base scope
   ⚠️ Low confidence response (48%)
      💡 Consider improving knowledge base coverage

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### **Diagnosi Immediata**
✅ **Problema identificato**: No pricing docs in KB  
✅ **Soluzione**: Add pricing documentation  
✅ **Priorità**: Alta (confidence 48%)

### **Fix & Verify**

```bash
# 1. Add pricing docs to KB
# 2. Re-ingest knowledge base
# 3. Test again with same query
# 4. Verify confidence increases to >80%
```

---

## 🎯 CASO D'USO 2: Ottimizzazione Strategia

### **Scenario**
Vuoi capire quale strategia funziona meglio per il tuo bot.

### **Analisi (5 minuti)**

```bash
# Analizza ultime 10 conversazioni
for conv_id in $(get_recent_conversations); do
  npx ts-node scripts/trace-decision.ts --conversation $conv_id >> analysis.txt
done

# Estrai metriche
grep "Strategy:" analysis.txt | sort | uniq -c
grep "Avg confidence:" analysis.txt | awk '{sum+=$3; count++} END {print sum/count}'
```

### **Output Esempio**

```
🎯 Strategies Used:
   graph_reasoning: 45 (45%) - Avg confidence: 89%
   rag_enhanced: 30 (30%) - Avg confidence: 72%
   hybrid: 15 (15%) - Avg confidence: 85%
   memory_personalized: 10 (10%) - Avg confidence: 88%

⚡ Performance:
   graph_reasoning: 420ms avg
   rag_enhanced: 280ms avg
   hybrid: 550ms avg
   memory_personalized: 180ms avg

📊 Success Rate:
   graph_reasoning: 95%
   rag_enhanced: 78%
   hybrid: 92%
   memory_personalized: 96%
```

### **Insights**

✅ **graph_reasoning**: Alta confidence (89%), alta success rate (95%), ma più lento (420ms)  
⚠️ **rag_enhanced**: Confidence media (72%), success rate più bassa (78%)  
✅ **memory_personalized**: Migliore confidence (88%) e più veloce (180ms)

### **Action Items**

1. **Migliorare KB**: rag_enhanced ha confidence bassa → add more docs
2. **Preferire graph_reasoning**: Per query relazionali ha 95% success
3. **Ottimizzare graph queries**: Ridurre latenza da 420ms a <300ms
4. **Aumentare uso memory**: Solo 10% ma 96% success rate

---

## 🐛 CASO D'USO 3: Debug Performance Lenta

### **Problema**
Bot risponde lentamente (>2 secondi).

### **Debug**

```bash
npx ts-node scripts/trace-decision.ts msg-slow-123
```

### **Output**

```
🔍 RETRIEVAL
   ✓ knowledge_graph: 25 results (1200ms) ⚠️
   ✓ knowledge_base: 10 results (300ms)
   ✓ persistent_memory: 5 results (50ms)

📊 OUTCOME
   ✓ Success
   Overall confidence: 87%
   Total time: 2150ms ⚠️

⚠️ ISSUES
   ⚠️ Slow response time (2150ms)
      💡 Consider optimizing retrieval or caching
   ℹ️ Graph query slow (1200ms)
      💡 Check graph entity count or add indexes
```

### **Diagnosi**
❌ **Bottleneck**: Graph query (1200ms)  
❌ **Causa**: Troppi risultati (25 entities)

### **Soluzioni**

```typescript
// Option 1: Limit graph results
queryGraph(botId, query, { maxEntities: 10 })

// Option 2: Add caching
const cachedGraph = await cache.get(`graph:${query}`)

// Option 3: Optimize graph queries
// Add indexes on Entity.entityName
```

---

## 📈 CASO D'USO 4: Monitoraggio Continuo

### **Setup Alert System**

```bash
#!/bin/bash
# monitor-traces.sh

# Run ogni ora
while true; do
  # Get recent conversations
  RECENT_CONVS=$(get_last_hour_conversations)
  
  # Analyze traces
  AVG_CONFIDENCE=$(analyze_confidence $RECENT_CONVS)
  AVG_TIME=$(analyze_time $RECENT_CONVS)
  ERROR_RATE=$(analyze_errors $RECENT_CONVS)
  
  # Alert se problemi
  if [ $AVG_CONFIDENCE -lt 70 ]; then
    send_alert "Low confidence: $AVG_CONFIDENCE%"
  fi
  
  if [ $AVG_TIME -gt 1000 ]; then
    send_alert "Slow responses: ${AVG_TIME}ms"
  fi
  
  if [ $ERROR_RATE -gt 10 ]; then
    send_alert "High error rate: $ERROR_RATE%"
  fi
  
  sleep 3600
done
```

### **Dashboard Metrics**

Track:
- Confidence trend (daily avg)
- Response time trend (P50, P95, P99)
- Strategy distribution (pie chart)
- Error rate (%) 
- KB coverage (queries with no results)

---

## 🎓 CASO D'USO 5: Training & Tuning

### **Weekly Review Process**

```bash
# 1. Export week traces
npx ts-node scripts/export-weekly-traces.ts > week-traces.json

# 2. Analyze patterns
npx ts-node scripts/analyze-patterns.ts week-traces.json

# Output:
# - Most common intents
# - Most queried entities
# - Knowledge gaps (queries with no KB results)
# - Underperforming strategies
```

### **Output Esempio**

```
📊 WEEKLY ANALYSIS (Jan 1-7, 2026)

🎯 INTENTS
   question: 450 (65%)
   info: 150 (22%)
   greeting: 80 (11%)
   escalation: 15 (2%)

🏷️ TOP ENTITIES
   iPhone 15 Pro: 120
   Pricing: 85
   Support: 65
   Features: 55

⚠️ KNOWLEDGE GAPS (queries with 0 KB results)
   "refund policy": 25 times ⚠️
   "enterprise pricing": 18 times ⚠️
   "API documentation": 12 times

💡 RECOMMENDATIONS
   1. Add refund policy doc (high priority)
   2. Add enterprise pricing page
   3. Add API documentation
   4. Improve "Features" entity connections in graph
```

### **Action Plan**

1. Add missing docs (refund, enterprise, API)
2. Re-index knowledge base
3. Test with same queries
4. Verify confidence improvement

---

## 💡 BEST PRACTICES

### **1. Debug Workflow**

```
User reports issue
    ↓
Get messageId from user/support team
    ↓
Run: npx ts-node scripts/trace-decision.ts <messageId>
    ↓
Identify root cause (no KB results, low confidence, wrong strategy)
    ↓
Fix (add docs, adjust strategy, improve graph)
    ↓
Verify with new test
```

### **2. Weekly Optimization**

```
Monday: Export previous week traces
    ↓
Analyze patterns and gaps
    ↓
Prioritize fixes (high-frequency gaps first)
    ↓
Implement fixes
    ↓
Friday: Verify improvements
```

### **3. Continuous Monitoring**

```
Automated alerts:
- Confidence < 70% → Alert team
- Response time > 1000ms → Check infrastructure
- Error rate > 10% → Investigate immediately
```

### **4. A/B Testing**

```typescript
// Test two strategies
const traceA = await testStrategy('rag_enhanced', testQueries)
const traceB = await testStrategy('graph_reasoning', testQueries)

// Compare
const winner = traceA.avgConfidence > traceB.avgConfidence ? 'A' : 'B'

// Deploy winner
updateDefaultStrategy(winner)
```

---

## 🚀 INTEGRATION EXAMPLES

### **Frontend Integration**

```typescript
// components/MessageWithTrace.tsx
import { useState } from 'react'

export function MessageWithTrace({ messageId, content }) {
  const [trace, setTrace] = useState(null)
  
  const loadTrace = async () => {
    const res = await fetch(`/api/decisions/${messageId}/trace`)
    setTrace(await res.json())
  }
  
  return (
    <div>
      <p>{content}</p>
      <button onClick={loadTrace}>Show reasoning</button>
      
      {trace && (
        <div className="trace-panel">
          <h4>Decision Reasoning</h4>
          <p>Strategy: {trace.decision.strategy}</p>
          <p>Why: {trace.decision.why}</p>
          <p>Confidence: {(trace.outcome.overallConfidence * 100).toFixed(0)}%</p>
          
          <h5>Sources Used:</h5>
          <ul>
            {trace.retrieval.sourcesUsed
              .filter(s => s.used)
              .map(s => (
                <li key={s.source}>
                  {s.source}: {s.resultsCount} results
                </li>
              ))
            }
          </ul>
        </div>
      )}
    </div>
  )
}
```

### **Slack Integration**

```typescript
// webhooks/slack-trace-alert.ts
import { buildDecisionTrace } from '@/lib/decision-tracer'

export async function sendTraceToSlack(messageId: string) {
  const trace = await buildDecisionTrace(convId, messageId)
  
  if (!trace) return
  
  // Alert if low confidence
  if (trace.outcome.overallConfidence < 0.6) {
    await slack.postMessage({
      channel: '#bot-alerts',
      text: `⚠️ Low confidence response detected`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Query:* ${trace.query}\n*Strategy:* ${trace.decision.strategy}\n*Confidence:* ${(trace.outcome.overallConfidence * 100).toFixed(0)}%`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Issues:*\n${trace.issues.map(i => `• ${i.message}`).join('\n')}`
          }
        }
      ]
    })
  }
}
```

### **Analytics Dashboard**

```typescript
// pages/analytics/traces.tsx
export default function TracesAnalytics() {
  const { data } = useSWR('/api/analytics/traces', fetcher)
  
  return (
    <div>
      <h1>Decision Traces Analytics</h1>
      
      <MetricCard
        title="Avg Confidence"
        value={`${(data.avgConfidence * 100).toFixed(0)}%`}
        trend={data.confidenceTrend}
      />
      
      <MetricCard
        title="Avg Response Time"
        value={`${data.avgTime}ms`}
        trend={data.timeTrend}
      />
      
      <StrategyDistribution data={data.strategyDist} />
      
      <RecentIssues issues={data.recentIssues} />
    </div>
  )
}
```

---

## ✅ CHECKLIST UTILIZZO

**Per ogni problema reportato:**
- [ ] Ottieni messageId
- [ ] Esegui trace
- [ ] Identifica root cause
- [ ] Implementa fix
- [ ] Verifica miglioramento

**Weekly:**
- [ ] Analizza trace settimana
- [ ] Identifica pattern e gap
- [ ] Prioritizza fix
- [ ] Deploy miglioramenti
- [ ] Misura impatto

**Monthly:**
- [ ] Review strategia generale
- [ ] A/B test nuove strategie
- [ ] Optimize performance
- [ ] Update documentation

---

**Decision Tracing = Debug Speed ⬆️ + Confidence ⬆️ + Quality ⬆️** 🚀

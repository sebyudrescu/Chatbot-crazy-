/**
 * ALERT MONITOR
 * 
 * Monitora il sistema e invia alert quando rileva anomalie
 * 
 * Usage:
 *   npx ts-node scripts/alert-monitor.ts
 *   npx ts-node scripts/alert-monitor.ts --once (single check)
 */

import { prisma } from '../lib/db'
import { getEventStats } from '../lib/event-store'

interface Alert {
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  botId?: string
  recommendation?: string
}

async function checkSystemHealth(): Promise<Alert[]> {
  const alerts: Alert[] = []

  // Get all active bots
  const bots = await prisma.chatbot.findMany({
    where: { isActive: true }
  })

  for (const bot of bots) {
    // Check last 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    // 1. Check error rate
    const stats = await getEventStats({
      botId: bot.id,
      startDate: oneHourAgo
    })

    if (stats.totalEvents > 0) {
      const errorRate = (stats.errorEvents / stats.totalEvents) * 100

      if (errorRate > 20) {
        alerts.push({
          severity: 'critical',
          title: 'High Error Rate',
          message: `Bot "${bot.companyName}" has ${errorRate.toFixed(1)}% error rate in last hour`,
          botId: bot.id,
          recommendation: 'Check event logs and fix recurring errors'
        })
      } else if (errorRate > 10) {
        alerts.push({
          severity: 'warning',
          title: 'Elevated Error Rate',
          message: `Bot "${bot.companyName}" has ${errorRate.toFixed(1)}% error rate in last hour`,
          botId: bot.id,
          recommendation: 'Monitor closely, may need attention'
        })
      }
    }

    // 2. Check response times
    const recentRequests = await prisma.event.findMany({
      where: {
        botId: bot.id,
        eventType: 'orchestrator.request.completed',
        timestamp: { gte: oneHourAgo }
      },
      take: 50
    })

    if (recentRequests.length > 0) {
      const avgTime = recentRequests.reduce((sum, e) => sum + (e.durationMs || 0), 0) / recentRequests.length

      if (avgTime > 2000) {
        alerts.push({
          severity: 'warning',
          title: 'Slow Response Times',
          message: `Bot "${bot.companyName}" avg response time is ${avgTime.toFixed(0)}ms`,
          botId: bot.id,
          recommendation: 'Consider optimizing retrieval or adding caching'
        })
      }
    }

    // 3. Check confidence scores
    const recentCompletions = await prisma.event.findMany({
      where: {
        botId: bot.id,
        eventType: 'orchestrator.request.completed',
        timestamp: { gte: oneHourAgo }
      },
      take: 20
    })

    if (recentCompletions.length >= 10) {
      const confidences = recentCompletions.map(e => {
        const meta = e.metadata ? JSON.parse(e.metadata) : {}
        return meta.confidence || 0
      }).filter(c => c > 0)

      if (confidences.length > 0) {
        const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length

        if (avgConfidence < 0.5) {
          alerts.push({
            severity: 'critical',
            title: 'Low Confidence Responses',
            message: `Bot "${bot.companyName}" avg confidence is ${(avgConfidence * 100).toFixed(0)}%`,
            botId: bot.id,
            recommendation: 'Knowledge base may be incomplete or queries are out of scope'
          })
        } else if (avgConfidence < 0.7) {
          alerts.push({
            severity: 'warning',
            title: 'Below Target Confidence',
            message: `Bot "${bot.companyName}" avg confidence is ${(avgConfidence * 100).toFixed(0)}%`,
            botId: bot.id,
            recommendation: 'Review KB coverage and improve documentation'
          })
        }
      }
    }

    // 4. Check failed ingestion jobs
    const failedJobs = await prisma.ingestionJob.count({
      where: {
        botId: bot.id,
        status: 'failed',
        createdAt: { gte: oneHourAgo }
      }
    })

    if (failedJobs > 0) {
      alerts.push({
        severity: 'warning',
        title: 'Failed Ingestion Jobs',
        message: `Bot "${bot.companyName}" has ${failedJobs} failed ingestion jobs`,
        botId: bot.id,
        recommendation: 'Check ingestion logs and retry failed jobs'
      })
    }

    // 5. Check KB status
    if (bot.kbStatus === 'failed') {
      alerts.push({
        severity: 'critical',
        title: 'KB Indexing Failed',
        message: `Bot "${bot.companyName}" knowledge base is in failed state`,
        botId: bot.id,
        recommendation: `Error: ${bot.kbIndexingError || 'Unknown error'}`
      })
    }
  }

  return alerts
}

async function sendAlerts(alerts: Alert[]) {
  if (alerts.length === 0) {
    console.log('✅ No alerts - system healthy')
    return
  }

  console.log(`\n⚠️  ${alerts.length} ALERT${alerts.length > 1 ? 'S' : ''} DETECTED`)
  console.log('━'.repeat(60))

  // Group by severity
  const critical = alerts.filter(a => a.severity === 'critical')
  const warning = alerts.filter(a => a.severity === 'warning')
  const info = alerts.filter(a => a.severity === 'info')

  if (critical.length > 0) {
    console.log('\n🚨 CRITICAL:')
    for (const alert of critical) {
      console.log(`   ${alert.title}`)
      console.log(`   ${alert.message}`)
      if (alert.recommendation) {
        console.log(`   💡 ${alert.recommendation}`)
      }
      console.log('')
    }
  }

  if (warning.length > 0) {
    console.log('\n⚠️  WARNING:')
    for (const alert of warning) {
      console.log(`   ${alert.title}`)
      console.log(`   ${alert.message}`)
      if (alert.recommendation) {
        console.log(`   💡 ${alert.recommendation}`)
      }
      console.log('')
    }
  }

  if (info.length > 0) {
    console.log('\nℹ️  INFO:')
    for (const alert of info) {
      console.log(`   ${alert.title}`)
      console.log(`   ${alert.message}`)
      console.log('')
    }
  }

  console.log('━'.repeat(60))

  // TODO: Send to external services (Slack, email, etc.)
  // For now, just console output
}

async function monitor() {
  console.log(`\n🔍 Checking system health...`)
  const alerts = await checkSystemHealth()
  await sendAlerts(alerts)
}

async function continuousMonitor(intervalMinutes: number = 5) {
  console.log(`\n🔄 Starting continuous monitoring (checking every ${intervalMinutes} minutes)`)
  console.log(`Press Ctrl+C to stop`)
  console.log('')

  // Initial check
  await monitor()

  // Set interval
  setInterval(async () => {
    await monitor()
  }, intervalMinutes * 60 * 1000)
}

// Main
async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--once')) {
    await monitor()
  } else if (args.includes('--interval')) {
    const intervalIndex = args.indexOf('--interval')
    const interval = parseInt(args[intervalIndex + 1] || '5')
    await continuousMonitor(interval)
  } else {
    await continuousMonitor(5)
  }
}

main()
  .then(() => {
    if (process.argv.includes('--once')) {
      process.exit(0)
    }
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })

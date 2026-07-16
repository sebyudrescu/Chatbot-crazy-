/**
 * CLEANUP OLD EVENTS
 * 
 * Script per pulire eventi vecchi secondo le retention policy
 */

import { cleanupOldEvents } from '../lib/event-store'

async function cleanup() {
  console.log(`\n🧹 CLEANING UP OLD EVENTS`)
  console.log(`==========================================\n`)

  console.log(`Retention Policy:`)
  console.log(`  - Info events: 30 days`)
  console.log(`  - Error events: 365 days`)
  console.log(`  - Milestone events: Forever`)
  console.log(``)

  const result = await cleanupOldEvents({
    keepDays: 30,
    keepErrorsDays: 365,
    keepMilestonePermanent: true,
  })

  console.log(`==========================================`)
  console.log(`✅ Cleanup complete`)
  console.log(`   Info events deleted: ${result.infoDeleted}`)
  console.log(`   Error events deleted: ${result.errorDeleted}`)
  console.log(`==========================================\n`)
}

cleanup()
  .then(() => {
    console.log(`\n✅ Done!`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`\n❌ Error:`, error)
    process.exit(1)
  })

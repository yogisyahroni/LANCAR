import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const errors = []

const read = (relativePath) => {
  const file = path.join(root, relativePath)
  if (!fs.existsSync(file)) {
    errors.push(`missing required file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(file, 'utf8')
}

const foodHome = read('android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/food/FoodHomeScreen.kt')
const dashboard = read('android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/main/DashboardScreen.kt')
const controls = read('android-app-customer/app/src/main/java/com/tembus/customer/ui/designsystem/TembusControls.kt')
const surfaces = read('android-app-customer/app/src/main/java/com/tembus/customer/ui/designsystem/TembusSurfaces.kt')
const acceptance = read('docs/design/mobile-component-acceptance.md')
const inventory = read('docs/design/tembus-component-adoption-inventory-2026.md')

for (const symbol of ['TembusSearchField', 'TembusChip', 'TembusIconButton', 'TembusMerchantCard', 'TembusSponsoredMerchantCard']) {
  if (!foodHome.includes(symbol)) errors.push(`FoodHomeScreen must adopt ${symbol}`)
}
if (!dashboard.includes('TembusBottomNavigation')) errors.push('Dashboard phone navigation must adopt TembusBottomNavigation')
if (!controls.includes('heightIn(min = 48.dp)')) errors.push('shared control touch target baseline is missing')
if (!controls.includes('this.selected = selected')) errors.push('TembusChip selected semantics are missing')
if (!acceptance.includes('Light, Dark, and System')) errors.push('mobile acceptance must cover Light/Dark/System')
for (const phrase of ['Font scale', '48dp', 'TalkBack', 'Loading', 'Long Indonesian/English', 'Remote components']) {
  if (!acceptance.toLowerCase().includes(phrase.toLowerCase())) errors.push(`mobile acceptance is missing ${phrase}`)
}
for (const phrase of ['Inventory result', 'Highest-frequency migration evidence', 'Removal policy']) {
  if (!inventory.includes(phrase)) errors.push(`component inventory is missing ${phrase}`)
}

const benchmarkPattern = /\b(?:Gojek|Grab|Uber|GoFood)\b/i
const productionRoots = [
  'android-app-customer/app/src/main/java',
  'android-app-merchant/app/src/main/java',
  'android-app/app/src/main/java',
  'frontend/src',
]
const walk = (relativeDir) => {
  const absoluteDir = path.join(root, relativeDir)
  if (!fs.existsSync(absoluteDir)) return
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relative = path.join(relativeDir, entry.name)
    if (entry.isDirectory()) walk(relative)
    else if (/\.(kt|tsx|ts)$/.test(entry.name)) {
      const source = fs.readFileSync(path.join(root, relative), 'utf8')
      if (benchmarkPattern.test(source)) errors.push(`benchmark vocabulary remains in production source: ${relative}`)
    }
  }
}
for (const productionRoot of productionRoots) walk(productionRoot)

if (/\p{Extended_Pictographic}/u.test(foodHome)) errors.push('FoodHomeScreen must not use emoji as functional UI fallback')

if (errors.length > 0) {
  console.error('TEMBUS component adoption/mobile acceptance: FAIL')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('TEMBUS component adoption/mobile acceptance: PASS (inventory, high-frequency adoption, naming, semantics, and mobile acceptance contract)')
}

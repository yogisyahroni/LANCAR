import { expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'

const THEME_CASES = [
  { mode: 'light', colorScheme: 'light' },
  { mode: 'dark', colorScheme: 'dark' },
  { mode: 'system', colorScheme: 'light' },
  { mode: 'system', colorScheme: 'dark' },
] as const

const AUTHENTICATED_ROUTES = [
  '/dashboard',
  '/orders',
  '/orders/exceptions',
  '/couriers',
  '/merchants',
  '/customers',
  '/finance',
  '/tax-center',
  '/pricing',
  '/zones',
  '/promos',
  '/broadcasts',
  '/risk-reviews',
  '/audit-logs',
  '/settings',
  '/app-experience/overview',
  '/app-experience/approval',
  '/app-experience/design-tokens',
  '/app-experience/preview',
] as const

const FULL_ADMIN_ROUTE_INVENTORY = [
  '/dashboard',
  '/orders',
  '/orders/exceptions',
  '/business-api-requests',
  '/couriers',
  '/courier-performance',
  '/merchant-performance',
  '/driver-wallet-holds',
  '/courier-applications',
  '/merchants',
  '/merchant-staff',
  '/courier-face-verifications',
  '/courier-safety-events',
  '/courier-growth',
  '/courier-market-config',
  '/courier-retention',
  '/risk-reviews',
  '/pricing',
  '/economics',
  '/disputes',
  '/cases',
  '/customers',
  '/hr/jobs',
  '/hr/applications',
  '/news',
  '/analytics',
  '/custom-reports',
  '/campaign-calendar',
  '/finance',
  '/tax-center',
  '/chart-of-accounts',
  '/tariff-engine',
  '/merchant-settlements',
  '/cost-intelligence',
  '/payment-links',
  '/zones',
  '/meeting-points',
  '/warehouse-operations',
  '/vouchers',
  '/promos',
  '/notifications',
  '/broadcasts',
  '/feature-flags',
  '/experiments',
  '/app-experience/overview',
  '/app-experience/home-layout',
  '/app-experience/campaigns',
  '/app-experience/campaign-intro',
  '/app-experience/service-visibility',
  '/app-experience/kill-switches',
  '/app-experience/targeting',
  '/app-experience/assets',
  '/app-experience/deep-links',
  '/app-experience/design-tokens',
  '/app-experience/preview',
  '/app-experience/approval',
  '/app-experience/revisions',
  '/app-experience/feature-flags',
  '/app-experience/scheduling',
  '/app-experience/version-policy',
  '/app-experience/analytics',
  '/localized-content',
  '/mobile-release-policies',
  '/audit-logs',
  '/agreements',
  '/settings',
  '/resi-templates',
  '/logistics-discount',
  '/maps-runtime',
  '/market-configuration',
] as const

async function mockAdminSessionAndApi(page: Page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    const pathname = new URL(url).pathname
    const isApiRequest = pathname.startsWith('/api/v1/')

    if (isApiRequest && pathname.endsWith('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'a11y-fixture',
            name: 'Accessibility Fixture',
            email: 'a11y@example.test',
            role: 'super_admin',
            permissions: ['experience.read', 'experience.draft.write', 'experience.asset.write', 'experience.publish', 'experience.approve', 'experience.rollback'],
          },
        }),
      })
      return
    }

    if (isApiRequest && pathname.endsWith('/auth/web/notifications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) })
      return
    }

    if (isApiRequest && (/\/api\/v1\/(admin|maps|experience)\//.test(pathname) || pathname === '/api/v1/payment-links')) {
      const responseByPath: Record<string, unknown> = {
        '/admin/dashboard/events': [],
        '/admin/dashboard/stats': {},
        '/admin/health': { components: [] },
        '/admin/admins': [],
        '/admin/audit-logs': [],
        '/admin/resi-templates': [],
        '/admin/settings': [],
        '/admin/maps-provider-config': {
          value: {
            enabled: true,
            active_provider: 'openstreetmap',
            fallback_provider: 'openstreetmap',
            tomtom_maps_enabled: false,
            openstreetmap_enabled: true,
            disabled_mode_enabled: true,
            config_ttl_seconds: 300,
            scopes: {
              global: { enabled: true, provider: 'openstreetmap' },
              customer_mobile: { enabled: true, provider: 'openstreetmap' },
              courier_mobile: { enabled: true, provider: 'openstreetmap' },
              web_customer: { enabled: true, provider: 'openstreetmap' },
              web_admin: { enabled: true, provider: 'openstreetmap' },
              tracking: { enabled: true, provider: 'openstreetmap' },
            },
            providers: {
              tomtom_maps: { requires_server_key: true, tiles_enabled: true, routing_enabled: true, geocoding_enabled: true },
              openstreetmap: { requires_server_key: false, tile_url_template: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: 'OpenStreetMap contributors', routing_enabled: true, geocoding_enabled: true },
            },
          },
          resolved: {},
          ops: {
            generated_at: '2026-09-10T00:00:00Z',
            status: 'operational',
            active_alerts: [],
            active_config: { enabled: true, active_provider: 'openstreetmap', fallback_provider: 'openstreetmap', tomtom_maps_enabled: false, openstreetmap_enabled: true },
            counters: {},
            latency: { sample_count: 0, average_ms: 0, p95_ms: 0 },
            cache: { hits: 0, misses: 0 },
            fallback: { total: 0, osm_fallbacks: 0, haversine_fallbacks: 0 },
            route_quality: { route_events: 0, road_route_successes: 0, distance_anomalies: 0, straight_line_fallbacks: 0, cache_hit_rate_percent: 0 },
            last_error: null,
            recent_events: [],
            quota: { tomtom_remaining_percent: null, status: 'not_configured' },
          },
        },
        '/admin/maps-provider-credentials': { credentials: [] },
        '/admin/maps-production-readiness': {
          generated_at: '2026-09-10T00:00:00Z',
          environment: 'development',
          overall_status: 'blocked',
          key_inventory: [],
          shared_key_findings: [],
          active_alerts: [],
          incident_response: { failover_steps: [], quota_steps: [], rotation_steps: [] },
          docs: [],
        },
        '/admin/finance/stats': { model_breakdown: [] },
        '/admin/pricing': [],
        '/admin/feature-flags': [],
        '/admin/analytics/reports': [],
        '/admin/couriers/performance': { data: [] },
        '/admin/merchants/performance': { merchants: [] },
        '/admin/driver-wallet-holds': { drivers: [] },
        '/admin/hr/jobs': [],
        '/admin/hr/applications': [],
        '/admin/zones': [],
        '/admin/warehouse/bags': [],
        '/admin/vouchers': [],
        '/admin/vouchers/stats': {},
        '/admin/notifications/templates': [],
        '/admin/courier-retention': { couriers: [] },
        '/admin/logistics-providers': [],
        '/admin/delivery-services': { services: [] },
        '/payment-links': { data: [] },
      }
      const response = responseByPath[pathname.replace('/api/v1', '')] ?? { data: [] }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
      return
    }

    await route.continue()
  })
}

async function scanPage(page: Page) {
  // Framer Motion fades the login shell in after navigation. Wait for the
  // settled visual state so axe evaluates the rendered colors, not a
  // transient opacity-blended frame.
  await page.waitForTimeout(750)
  await page.addScriptTag({ content: axe.source })
  return page.evaluate(async () => {
    const browserWindow = window as typeof window & {
      axe: { run: (context: Document, options: { runOnly: { type: 'tag'; values: string[] } }) => Promise<{ violations: unknown[] }> }
    }
    return browserWindow.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    })
  })
}

async function assertVisibleInteractiveNames(page: Page) {
  const findings = await page.evaluate(() => {
    const selectors = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]'
    const visible = (element: Element) => {
      let current: Element | null = element
      while (current) {
        const style = getComputedStyle(current)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
        current = current.parentElement
      }
      return element.getClientRects().length > 0
    }
    const text = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const visibleLabel = (element: Element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        const labels = element.labels ? Array.from(element.labels).map(text).join(' ').trim() : ''
        if (labels) return labels
      }
      const clone = element.cloneNode(true) as HTMLElement
      clone.querySelectorAll('svg, img, [aria-hidden="true"], [hidden], .sr-only').forEach((child) => child.remove())
      return clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    }
    const accessibleName = (element: Element) => {
      const ariaLabel = element.getAttribute('aria-label')?.trim()
      if (ariaLabel) return ariaLabel
      const labelledBy = element.getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((label) => text(label!))
        .join(' ')
        .trim()
      if (labelledBy) return labelledBy
      const title = element.getAttribute('title')?.trim()
      if (title) return title
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        const labels = element.labels ? Array.from(element.labels).map(text).join(' ').trim() : ''
        if (labels) return labels
      }
      const imageAlt = Array.from(element.querySelectorAll('img[alt]')).map((image) => image.getAttribute('alt')?.trim() ?? '').join(' ').trim()
      return text(element) || imageAlt
    }

    const controls = Array.from(document.querySelectorAll<HTMLElement>(selectors)).filter(visible)
    const unnamed = controls
      .filter(visible)
      .filter((element) => !accessibleName(element))
      .map((element) => ({ tag: element.tagName.toLowerCase(), role: element.getAttribute('role'), id: element.id, html: element.outerHTML.slice(0, 180) }))

    const labelMismatches = controls
      .map((element) => ({ element, label: visibleLabel(element), name: accessibleName(element) }))
      .filter(({ element, label, name }) => {
        if (element instanceof HTMLSelectElement) return false
        if (!label || !name) return false
        const firstMeaningfulWord = label.toLocaleLowerCase().split(/\s+/).find((word) => word.replace(/[^\p{L}\p{N}]/gu, '').length >= 3)
        return Boolean(firstMeaningfulWord && !name.toLocaleLowerCase().includes(firstMeaningfulWord))
      })
      .map(({ element, label, name }) => ({ tag: element.tagName.toLowerCase(), role: element.getAttribute('role'), label, name, html: element.outerHTML.slice(0, 180) }))

    const interactiveIconFindings = controls.flatMap((element) => {
      const iconOnly = !visibleLabel(element)
      return Array.from(element.querySelectorAll<SVGElement>('svg'))
        .filter(visible)
        .filter((icon) => icon.getAttribute('role') !== 'img' && icon.getAttribute('aria-label') === null && icon.getAttribute('aria-hidden') !== 'true')
        .map((icon) => ({
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          iconOnly,
          html: element.outerHTML.slice(0, 180),
        }))
    })

    const semanticFindings = {
      unnamedGraphics: Array.from(document.querySelectorAll<HTMLElement>('[role="img"]'))
        .filter(visible)
        .filter((element) => !accessibleName(element))
        .map((element) => ({ html: element.outerHTML.slice(0, 180) })),
      unnamedLiveRegions: Array.from(document.querySelectorAll<HTMLElement>('[role="alert"], [role="status"]'))
        .filter(visible)
        .filter((element) => !accessibleName(element))
        .map((element) => ({ role: element.getAttribute('role'), html: element.outerHTML.slice(0, 180) })),
      unassociatedInvalidFields: Array.from(document.querySelectorAll<HTMLElement>('[aria-invalid="true"]'))
        .filter(visible)
        .filter((element) => {
          const ids = element.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? []
          return ids.length === 0 || ids.some((id) => !document.getElementById(id)?.textContent?.trim())
        })
        .map((element) => ({ tag: element.tagName.toLowerCase(), id: element.id, html: element.outerHTML.slice(0, 180) })),
      invalidSortStates: Array.from(document.querySelectorAll<HTMLElement>('[aria-sort]'))
        .filter(visible)
        .filter((element) => !['ascending', 'descending', 'none', 'other'].includes(element.getAttribute('aria-sort') ?? ''))
        .map((element) => ({ value: element.getAttribute('aria-sort'), html: element.outerHTML.slice(0, 180) })),
      invalidControlledStates: Array.from(document.querySelectorAll<HTMLElement>('[role="switch"], [role="checkbox"], [role="radio"], [role="tab"]'))
        .filter(visible)
        .filter((element) => {
          const role = element.getAttribute('role');
          const attribute = role === 'tab' ? 'aria-selected' : 'aria-checked';
          return !['true', 'false'].includes(element.getAttribute(attribute) ?? '');
        })
        .map((element) => ({ role: element.getAttribute('role'), html: element.outerHTML.slice(0, 180) })),
      lowReadabilityDisabledStates: Array.from(document.querySelectorAll<HTMLElement>('[disabled], [aria-disabled="true"]'))
        .filter(visible)
        .filter((element) => Number.parseFloat(getComputedStyle(element).opacity) < 0.6)
        .map((element) => ({ opacity: getComputedStyle(element).opacity, html: element.outerHTML.slice(0, 180) })),
    }

    return { unnamed, labelMismatches, interactiveIconFindings, semanticFindings }
  })

  expect(findings.unnamed, JSON.stringify(findings.unnamed)).toEqual([])
  expect(findings.labelMismatches, JSON.stringify(findings.labelMismatches)).toEqual([])
  expect(findings.interactiveIconFindings, JSON.stringify(findings.interactiveIconFindings)).toEqual([])
  expect(findings.semanticFindings, JSON.stringify(findings.semanticFindings)).toEqual({
    unnamedGraphics: [],
    unnamedLiveRegions: [],
    unassociatedInvalidFields: [],
    invalidSortStates: [],
    invalidControlledStates: [],
    lowReadabilityDisabledStates: [],
  })
}

async function assertVisibleIconSemantics(page: Page) {
  const findings = await page.evaluate(() => {
    const visible = (element: Element) => {
      let current: Element | null = element
      while (current) {
        const style = getComputedStyle(current)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
        current = current.parentElement
      }
      return element.getClientRects().length > 0
    }

    return Array.from(document.querySelectorAll<SVGElement>('svg'))
      .filter(visible)
      .flatMap((icon) => {
        if (icon.getAttribute('aria-hidden') === 'true') return []
        if (icon.parentElement?.closest('[role="img"]')) return []
        if (icon.getAttribute('role') === 'application' && icon.classList.contains('recharts-surface')) return []
        if (icon.getAttribute('role') === 'img') {
          const hasName = Boolean(
            icon.getAttribute('aria-label')?.trim() ||
              icon.getAttribute('aria-labelledby')?.trim() ||
              icon.querySelector('title')?.textContent?.trim(),
          )
          return hasName
            ? []
            : [{ reason: 'role=img SVG must have an accessible name', html: icon.outerHTML.slice(0, 220) }]
        }

        const owner = icon.closest('button, a[href], [role="button"], [role="link"]')
        return [{
          reason: owner
            ? 'interactive SVG must be aria-hidden when the control owns its accessible name'
            : 'decorative SVG must be aria-hidden or an explicitly named role=img',
          html: icon.outerHTML.slice(0, 220),
        }]
      })
  })

  expect(findings, JSON.stringify(findings)).toEqual([])
}

async function assertDocumentSemantics(page: Page) {
  const findings = await page.evaluate(() => {
    const visible = (element: Element) => {
      let current: Element | null = element
      while (current) {
        const style = getComputedStyle(current)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
        current = current.parentElement
      }
      return element.getClientRects().length > 0
    }
    const headings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
      .filter(visible)
      .map((element) => ({ level: Number(element.tagName.slice(1)), text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '' }))
    const headingSkips = headings.slice(1).flatMap((heading, index) => {
      const previous = headings[index]
      return heading.level > previous.level + 1 ? [{ from: previous.level, to: heading.level, text: heading.text }] : []
    })
    const unnamedNavs = Array.from(document.querySelectorAll<HTMLElement>('nav'))
      .filter(visible)
      .filter((nav) => !nav.getAttribute('aria-label')?.trim() && !nav.getAttribute('aria-labelledby')?.trim())
      .map((nav) => ({ html: nav.outerHTML.slice(0, 220) }))
    const chartSummaries = Array.from(document.querySelectorAll<HTMLElement>('[role="img"], [role="group"]'))
      .filter(visible)
      .filter((region) => /chart|grafik|histogram|map|peta/i.test(region.getAttribute('aria-label') ?? ''))
      .filter((region) => {
        const ids = region.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? []
        return ids.length === 0 || ids.some((id) => !document.getElementById(id)?.textContent?.trim())
      })
      .map((region) => ({ html: region.outerHTML.slice(0, 220) }))
    return {
      mainCount: Array.from(document.querySelectorAll('main, [role="main"]')).filter(visible).length,
      h1Count: headings.filter((heading) => heading.level === 1).length,
      firstHeadingLevel: headings[0]?.level ?? null,
      headingSkips,
      unnamedNavs,
      chartSummaries,
    }
  })

  expect(findings.mainCount, JSON.stringify(findings)).toBe(1)
  expect(findings.h1Count, JSON.stringify(findings)).toBe(1)
  expect(findings.firstHeadingLevel, JSON.stringify(findings)).toBe(1)
  expect(findings.headingSkips, JSON.stringify(findings)).toEqual([])
  expect(findings.unnamedNavs, JSON.stringify(findings)).toEqual([])
  expect(findings.chartSummaries, JSON.stringify(findings)).toEqual([])
}

async function assertTableHeaderSemantics(page: Page) {
  const findings = await page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
    }

    return Array.from(document.querySelectorAll<HTMLTableElement>('table'))
      .filter(visible)
      .flatMap((table) => Array.from(table.querySelectorAll<HTMLTableCellElement>('th')).filter((header) => {
        const scope = header.getAttribute('scope')
        return scope !== 'col' && scope !== 'row' && scope !== 'colgroup' && scope !== 'rowgroup'
      }).map((header) => ({
        text: header.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        html: header.outerHTML.slice(0, 220),
      })))
  })

  expect(findings, JSON.stringify(findings)).toEqual([])
}

test.describe('Admin WCAG 2.1 AA theme matrix', () => {
  for (const themeCase of THEME_CASES) {
    test(`login is violation-free in ${themeCase.mode}/${themeCase.colorScheme} mode @a11y`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: themeCase.colorScheme })
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem('lancar-admin-theme', selectedTheme)
      }, themeCase.mode)
      await page.goto('/login', { waitUntil: 'networkidle' })
      const results = await scanPage(page)
      expect(results.violations, JSON.stringify({ ...themeCase, violations: results.violations })).toEqual([])
    })
  }
})

test.describe('Admin representative authenticated route matrix', () => {
  for (const themeCase of THEME_CASES) {
    for (const route of AUTHENTICATED_ROUTES) {
      test(`${route} has no ${themeCase.mode}/${themeCase.colorScheme} violations @a11y`, async ({ page }) => {
        await mockAdminSessionAndApi(page)
        await page.emulateMedia({ colorScheme: themeCase.colorScheme })
        await page.addInitScript((selectedTheme) => {
          window.localStorage.setItem('lancar-admin-theme', selectedTheme)
        }, themeCase.mode)
        await page.goto(route, { waitUntil: 'networkidle' })

        const results = await scanPage(page)
        expect(results.violations, JSON.stringify({ ...themeCase, route, violations: results.violations })).toEqual([])
      })
    }
  }
})

test.describe('Admin full registered route inventory', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const route of FULL_ADMIN_ROUTE_INVENTORY) {
      test(`${route} has no ${theme} violations in the registered route inventory @a11y @inventory`, async ({ page }) => {
        await mockAdminSessionAndApi(page)
        await page.emulateMedia({ colorScheme: theme })
        await page.addInitScript((selectedTheme) => {
          window.localStorage.setItem('lancar-admin-theme', selectedTheme)
        }, theme)
        await page.goto(route, { waitUntil: 'networkidle' })

        const results = await scanPage(page)
        expect(results.violations, JSON.stringify({ route, theme, violations: results.violations })).toEqual([])
        await assertVisibleInteractiveNames(page)
        await assertVisibleIconSemantics(page)
        await assertDocumentSemantics(page)
        await assertTableHeaderSemantics(page)
      })
    }
  }
})

test.describe('Admin mobile shell semantics', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`mobile navigation keeps named controls and decorative icon semantics in ${theme} @a11y @inventory`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await mockAdminSessionAndApi(page)
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem('lancar-admin-theme', selectedTheme)
      }, theme)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })

      await assertVisibleInteractiveNames(page)
      await assertVisibleIconSemantics(page)
      await assertDocumentSemantics(page)
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await expect(page.getByRole('navigation', { name: 'Navigasi mobile Admin' })).toBeVisible()
      await assertVisibleInteractiveNames(page)
      await assertVisibleIconSemantics(page)
    })
  }
})

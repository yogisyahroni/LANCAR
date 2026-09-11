import { test, expect, type Page } from '@playwright/test';
import * as axe from 'axe-core';

const PUBLIC_ROUTES = ['/', '/login', '/daftar', '/cek-resi', '/track/invalid'] as const;
const AUTHENTICATED_ROUTES = [
  '/dashboard',
  '/orders',
  '/orders/new',
  '/orders/new/food',
  '/orders/new/ondemand',
  '/orders/new/aggregator',
  '/resi',
  '/payment-links',
  '/profil',
  '/alamat',
  '/disputes',
  '/notifikasi',
] as const;

const FULL_CUSTOMER_ROUTE_INVENTORY = [
  '/',
  '/login',
  '/daftar',
  '/cek-resi',
  '/track/invalid',
  '/pay/fixture-payment',
  '/location-requests/fixture-token',
  '/dashboard',
  '/orders',
  '/orders/new',
  '/orders/new/food',
  '/orders/new/ondemand',
  '/orders/new/aggregator',
  '/orders/bulk',
  '/orders/fixture-order',
  '/resi',
  '/resi/fixture-resi',
  '/payment-links',
  '/profil',
  '/alamat',
  '/disputes',
  '/notifikasi',
  '/voucher',
  '/products',
  '/laporan',
  '/analytics',
  '/feature-flags',
] as const;

type AccessibilityResult = {
  violations: Array<{ id: string; impact?: string | null }>;
};

async function scanPage(page: Page): Promise<AccessibilityResult> {
  // Framer Motion may temporarily blend text with a transparent/translated
  // parent during route entry. Scan the settled visual state, matching the
  // same gate used by the Admin matrix.
  await page.waitForTimeout(750);
  await page.addScriptTag({ content: axe.source });

  return page.evaluate(async () => {
    const browserWindow = window as unknown as Window & {
      axe: {
        run: (
          context: Document,
          options: { runOnly: { type: 'tag'; values: string[] } },
        ) => Promise<AccessibilityResult>;
      };
    };

    return browserWindow.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
      },
    });
  });
}

async function assertVisibleInteractiveNames(page: Page) {
  const findings = await page.evaluate(() => {
    const selectors = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]';
    const visible = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        current = current.parentElement;
      }
      return element.getClientRects().length > 0;
    };
    const text = (element: Element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const visibleLabel = (element: Element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        const labels = element.labels ? Array.from(element.labels).map(text).join(' ').trim() : '';
        if (labels) return labels;
      }
      const clone = element.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('svg, img, [aria-hidden="true"], [hidden], .sr-only').forEach((child) => child.remove());
      return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    };
    const accessibleName = (element: Element) => {
      const ariaLabel = element.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const labelledBy = element.getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((label) => text(label!))
        .join(' ')
        .trim();
      if (labelledBy) return labelledBy;
      const title = element.getAttribute('title')?.trim();
      if (title) return title;
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        const labels = element.labels ? Array.from(element.labels).map(text).join(' ').trim() : '';
        if (labels) return labels;
      }
      const imageAlt = Array.from(element.querySelectorAll('img[alt]')).map((image) => image.getAttribute('alt')?.trim() ?? '').join(' ').trim();
      return text(element) || imageAlt;
    };

    const controls = Array.from(document.querySelectorAll<HTMLElement>(selectors)).filter(visible);
    const unnamed = controls
      .filter(visible)
      .filter((element) => !accessibleName(element))
      .map((element) => ({ tag: element.tagName.toLowerCase(), role: element.getAttribute('role'), id: element.id, html: element.outerHTML.slice(0, 180) }));

    const labelMismatches = controls
      .map((element) => ({ element, label: visibleLabel(element), name: accessibleName(element) }))
      .filter(({ label, name }) => {
        if (!label || !name) return false;
        const firstMeaningfulWord = label.toLocaleLowerCase().split(/\s+/).find((word) => word.replace(/[^\p{L}\p{N}]/gu, '').length >= 3);
        return Boolean(firstMeaningfulWord && !name.toLocaleLowerCase().includes(firstMeaningfulWord));
      })
      .map(({ element, label, name }) => ({ tag: element.tagName.toLowerCase(), role: element.getAttribute('role'), label, name, html: element.outerHTML.slice(0, 180) }));

    const interactiveIconFindings = controls.flatMap((element) => {
      const iconOnly = !visibleLabel(element);
      return Array.from(element.querySelectorAll<SVGElement>('svg'))
        .filter(visible)
        .filter((icon) => icon.getAttribute('role') !== 'img' && icon.getAttribute('aria-label') === null && icon.getAttribute('aria-hidden') !== 'true')
        .map((icon) => ({
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          iconOnly,
          html: element.outerHTML.slice(0, 180),
        }));
    });

    const iconOnlyControlsWithoutTooltip = controls
      .filter((element) => element.tagName === 'BUTTON' || element.getAttribute('role') === 'button')
      .filter((element) => !visibleLabel(element) && element.querySelector('svg, img'))
      .filter((element) => !element.getAttribute('title')?.trim())
      .map((element) => ({ html: element.outerHTML.slice(0, 220) }));

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
          const ids = element.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
          return ids.length === 0 || ids.some((id) => !document.getElementById(id)?.textContent?.trim());
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
      disabledControlsWithoutCue: Array.from(document.querySelectorAll<HTMLElement>('[disabled], [aria-disabled="true"]'))
        .filter(visible)
        .filter((element) => getComputedStyle(element).cursor !== 'not-allowed')
        .map((element) => ({ cursor: getComputedStyle(element).cursor, html: element.outerHTML.slice(0, 180) })),
      statusBadgesWithoutMeaning: Array.from(document.querySelectorAll<HTMLElement>('[data-status-badge="true"]'))
        .filter(visible)
        .filter((element) => !element.textContent?.trim() || !element.querySelector('svg'))
        .map((element) => ({ html: element.outerHTML.slice(0, 180) })),
    };

    return { unnamed, labelMismatches, interactiveIconFindings, iconOnlyControlsWithoutTooltip, semanticFindings };
  });

  expect(findings.unnamed, JSON.stringify(findings.unnamed)).toEqual([]);
  expect(findings.labelMismatches, JSON.stringify(findings.labelMismatches)).toEqual([]);
  expect(findings.interactiveIconFindings, JSON.stringify(findings.interactiveIconFindings)).toEqual([]);
  expect(findings.iconOnlyControlsWithoutTooltip, JSON.stringify(findings.iconOnlyControlsWithoutTooltip)).toEqual([]);
  expect(findings.semanticFindings, JSON.stringify(findings.semanticFindings)).toEqual({
    unnamedGraphics: [],
    unnamedLiveRegions: [],
    unassociatedInvalidFields: [],
    invalidSortStates: [],
    invalidControlledStates: [],
    lowReadabilityDisabledStates: [],
    disabledControlsWithoutCue: [],
    statusBadgesWithoutMeaning: [],
  });
}

async function assertVisibleIconSemantics(page: Page) {
  const findings = await page.evaluate(() => {
    const visible = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        current = current.parentElement;
      }
      return element.getClientRects().length > 0;
    };

    return Array.from(document.querySelectorAll<SVGElement>('svg'))
      .filter(visible)
      .flatMap((icon) => {
        if (icon.getAttribute('aria-hidden') === 'true') return [];
        if (icon.parentElement?.closest('[role="img"]')) return [];
        if (icon.getAttribute('role') === 'application' && icon.classList.contains('recharts-surface')) return [];
        if (icon.getAttribute('role') === 'img') {
          const hasName = Boolean(
            icon.getAttribute('aria-label')?.trim() ||
              icon.getAttribute('aria-labelledby')?.trim() ||
              icon.querySelector('title')?.textContent?.trim(),
          );
          return hasName
            ? []
            : [{ reason: 'role=img SVG must have an accessible name', html: icon.outerHTML.slice(0, 220) }];
        }

        const owner = icon.closest('button, a[href], [role="button"], [role="link"]');
        return [
          {
            reason: owner
              ? 'interactive SVG must be aria-hidden when the control owns its accessible name'
              : 'decorative SVG must be aria-hidden or an explicitly named role=img',
            html: icon.outerHTML.slice(0, 220),
          },
        ];
      });
  });

  expect(findings, JSON.stringify(findings)).toEqual([]);
}

async function assertVisibleFocusIndicators(page: Page) {
  const findings = await page.evaluate(() => {
    const selectors = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]';
    const visible = (element: Element) => element instanceof HTMLElement && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    return Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter(visible)
      .slice(0, 12)
      .flatMap((element) => {
        element.focus({ preventScroll: true });
        const style = getComputedStyle(element);
        const hasIndicator = style.outlineStyle !== 'none' && style.outlineWidth !== '0px' || style.boxShadow !== 'none';
        return hasIndicator ? [] : [{ tag: element.tagName.toLowerCase(), name: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80) || '' }];
      });
  });
  expect(findings, JSON.stringify(findings)).toEqual([]);
}

async function assertDocumentSemantics(page: Page) {
  const findings = await page.evaluate(() => {
    const visible = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        current = current.parentElement;
      }
      return element.getClientRects().length > 0;
    };
    const headings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
      .filter(visible)
      .map((element) => ({ level: Number(element.tagName.slice(1)), text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '' }));
    const headingSkips = headings.slice(1).flatMap((heading, index) => {
      const previous = headings[index];
      return heading.level > previous.level + 1 ? [{ from: previous.level, to: heading.level, text: heading.text }] : [];
    });
    const unnamedNavs = Array.from(document.querySelectorAll<HTMLElement>('nav'))
      .filter(visible)
      .filter((nav) => {
        const ariaLabel = nav.getAttribute('aria-label')?.trim();
        const labelledBy = nav.getAttribute('aria-labelledby')?.trim();
        return !ariaLabel && !labelledBy;
      })
      .map((nav) => ({ html: nav.outerHTML.slice(0, 220) }));
    const chartSummaries = Array.from(document.querySelectorAll<HTMLElement>('[role="img"], [role="group"]'))
      .filter(visible)
      .filter((region) => /chart|grafik|histogram|map|peta/i.test(region.getAttribute('aria-label') ?? ''))
      .filter((region) => {
        const ids = region.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
        return ids.length === 0 || ids.some((id) => !document.getElementById(id)?.textContent?.trim());
      })
      .map((region) => ({ html: region.outerHTML.slice(0, 220) }));
    return {
      mainCount: Array.from(document.querySelectorAll('main, [role="main"]')).filter(visible).length,
      h1Count: headings.filter((heading) => heading.level === 1).length,
      firstHeadingLevel: headings[0]?.level ?? null,
      headings,
      headingSkips,
      unnamedNavs,
      chartSummaries,
    };
  });

  expect(findings.mainCount, JSON.stringify(findings)).toBe(1);
  expect(findings.h1Count, JSON.stringify(findings)).toBe(1);
  expect(findings.firstHeadingLevel, JSON.stringify(findings)).toBe(1);
  expect(findings.headingSkips, JSON.stringify(findings)).toEqual([]);
  expect(findings.unnamedNavs, JSON.stringify(findings)).toEqual([]);
  expect(findings.chartSummaries, JSON.stringify(findings)).toEqual([]);
}

async function mockCustomerSessionAndApi(page: Page) {
  await page.context().addCookies([
    { name: 'tembus_web_session', value: 'a11y-customer-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/auth/web/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'a11y-customer-fixture', full_name: 'Accessibility Fixture', email: 'a11y@example.test' } }),
      });
      return;
    }
    if (url.includes('/auth/web/notifications')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
      return;
    }
    if (/\/auth\/web\/orders\/fixture-order$/.test(new URL(url).pathname)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          order: {
            id: 'fixture-order',
            order_number: 'ORD-FIXTURE-001',
            pickup_address: 'Jl. Pickup Fixture 1',
            dropoff_address: 'Jl. Dropoff Fixture 2',
            recipient_name: 'Recipient Fixture',
            recipient_phone_masked: '08******01',
            model: 'instant',
            service_category: 'package_on_demand',
            service_code: 'tembus_instant',
            status: 'in_transit',
            payment_status: 'paid',
            distance_km: 4.2,
            base_price_idr: 10000,
            volumetric_surcharge_idr: 0,
            insurance_premium_idr: 0,
            total_price_idr: 10000,
            has_insurance: false,
            insured_value_idr: 0,
            package_details: { category: 'document', item_description: 'Fixture document', weight_kg: 1, package_count: 1 },
            customer_notes: '',
            schedule_type: 'now',
            scheduled_at: '2026-09-10T08:00:00.000Z',
            created_at: '2026-09-10T08:00:00.000Z',
            courier_name: 'Courier Fixture',
            courier_vehicle: 'Motor',
            courier_plate: 'B 1234 FIX',
          },
          events: [],
          carrier_events: [],
          proofs: [],
        }),
      });
      return;
    }
    if (url.includes('/auth/web/orders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orders: [] }) });
      return;
    }
    if (new URL(url).pathname === '/api/v1/payment-links') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            id: 'PAYMENT-LINK-A11Y',
            status: 'paid',
            item_name: 'Fixture payment link',
            item_image_url: null,
            delivery_fee_amount: 2500,
            dropoff_address: 'Jl. Payment Link Fixture 123, Jakarta',
            expired_at: '2026-12-31T23:59:59.000Z',
            payment_url: 'https://example.test/pay/PAYMENT-LINK-A11Y',
          }],
        }),
      });
      return;
    }
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
      return;
    }
    await route.continue();
  });
}

async function gotoAccessibilityRoute(page: Page, route: string) {
  const isPublicFixtureRoute = route.startsWith('/pay/') || route.startsWith('/location-requests/');
  await page.goto(route, { waitUntil: isPublicFixtureRoute ? 'domcontentloaded' : 'networkidle' });

  if (isPublicFixtureRoute) {
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  }
}

const THEME_CASES = [
  { mode: 'light', colorScheme: 'light' },
  { mode: 'dark', colorScheme: 'dark' },
  { mode: 'system', colorScheme: 'light' },
  { mode: 'system', colorScheme: 'dark' },
] as const;

test.describe('WCAG 2.1 AA public surfaces', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`has no automated accessibility violations: ${route} @a11y`, async ({ page }) => {
      await gotoAccessibilityRoute(page, route);
      const results = await scanPage(page);

      expect(results.violations, JSON.stringify(results.violations)).toEqual([]);
    });
  }
});

test.describe('WCAG 2.1 AA theme matrix', () => {
  for (const themeCase of THEME_CASES) {
    for (const route of PUBLIC_ROUTES) {
      test(`has no ${themeCase.mode}/${themeCase.colorScheme} violations: ${route} @a11y`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: themeCase.colorScheme });
        await page.addInitScript((selectedTheme) => {
          window.localStorage.setItem('tembus-theme', selectedTheme);
        }, themeCase.mode);
        await gotoAccessibilityRoute(page, route);

        const results = await scanPage(page);
        expect(results.violations, JSON.stringify({ ...themeCase, route, violations: results.violations })).toEqual([]);
      });
    }
  }
});

test.describe('WCAG 2.1 AA authenticated Customer route matrix', () => {
  for (const themeCase of THEME_CASES) {
    for (const route of AUTHENTICATED_ROUTES) {
      test(`has no ${themeCase.mode}/${themeCase.colorScheme} violations: ${route} @a11y`, async ({ page }) => {
        await mockCustomerSessionAndApi(page);
        await page.emulateMedia({ colorScheme: themeCase.colorScheme });
        await page.addInitScript((selectedTheme) => {
          window.localStorage.setItem('tembus-theme', selectedTheme);
        }, themeCase.mode);
        await gotoAccessibilityRoute(page, route);

        const results = await scanPage(page);
        expect(results.violations, JSON.stringify({ ...themeCase, route, violations: results.violations })).toEqual([]);
      });
    }
  }
});

test.describe('WCAG 2.1 AA full Customer route inventory', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const route of FULL_CUSTOMER_ROUTE_INVENTORY) {
      test(`${route} has no ${theme} violations in the registered route inventory @a11y @inventory`, async ({ page }) => {
        if (route !== '/' && route !== '/login' && route !== '/daftar' && route !== '/cek-resi' && route !== '/track/invalid' && route.startsWith('/pay/') === false && route.startsWith('/location-requests/') === false) {
          await mockCustomerSessionAndApi(page);
        }
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript((selectedTheme) => {
          window.localStorage.setItem('tembus-theme', selectedTheme);
        }, theme);
        await gotoAccessibilityRoute(page, route);

        const results = await scanPage(page);
        expect(results.violations, JSON.stringify({ route, theme, violations: results.violations })).toEqual([]);
        await assertVisibleInteractiveNames(page);
        await assertVisibleIconSemantics(page);
        await assertVisibleFocusIndicators(page);
        await assertDocumentSemantics(page);
      });
    }
  }
});

test.describe('Customer mobile shell semantics', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`mobile navigation keeps named controls and decorative icon semantics in ${theme} @a11y @inventory`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await mockCustomerSessionAndApi(page);
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((selectedTheme) => {
        window.localStorage.setItem('tembus-theme', selectedTheme);
      }, theme);
      await page.goto('/dashboard', { waitUntil: 'networkidle' });

      await assertVisibleInteractiveNames(page);
      await assertVisibleIconSemantics(page);
      await assertDocumentSemantics(page);
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('navigation', { name: 'Navigasi mobile' })).toBeVisible();
      await assertVisibleInteractiveNames(page);
      await assertVisibleIconSemantics(page);
    });
  }
});

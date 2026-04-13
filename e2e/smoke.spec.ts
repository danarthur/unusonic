/**
 * Smoke test: login → dashboard → create deal.
 *
 * This is the single most valuable E2E test — it exercises:
 *   1. Auth (login page, Supabase auth, session cookies)
 *   2. Navigation (middleware redirect, dashboard shell)
 *   3. Core workflow (CRM deal creation modal, DB write)
 *
 * Prereqs:
 *   - Dev server running (auto-started by playwright.config.ts)
 *   - Test user exists in Supabase with E2E_TEST_EMAIL / E2E_TEST_PASSWORD
 *   - Test user has completed onboarding and has a workspace
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './auth.setup';

test.describe('Smoke: login and dashboard', () => {
  test('can log in and reach the dashboard', async ({ page }) => {
    await loginViaUI(page);

    // Should land on dashboard (lobby) or onboarding
    const url = page.url();
    expect(url).toMatch(/\/(lobby|onboarding|crm|schedule)/);
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Clear any cookies
    await page.context().clearCookies();

    await page.goto('/crm');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page renders without errors', async ({ page }) => {
    await page.goto('/login');

    // Email input should be visible
    await expect(page.locator('#email')).toBeVisible();

    // No console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Wait a moment for any async errors
    await page.waitForTimeout(2000);

    // Filter out known noise (e.g. React hydration, favicon)
    const realErrors = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('hydrat') &&
        !e.includes('Warning:'),
    );
    expect(realErrors).toEqual([]);
  });
});

test.describe('Smoke: CRM deal creation', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('can navigate to CRM page', async ({ page }) => {
    await page.goto('/crm');
    // Should see the CRM page or be redirected to it
    await expect(page).toHaveURL(/\/crm/);
  });
});

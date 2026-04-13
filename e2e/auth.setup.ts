/**
 * Auth helper for E2E tests.
 *
 * Provides a reusable login function that authenticates via the login page
 * and saves session state so subsequent tests can skip login.
 *
 * Set these env vars (or in .env.test):
 *   E2E_TEST_EMAIL    — email of a seeded test user
 *   E2E_TEST_PASSWORD — password for the test user
 */

import { type Page, expect } from '@playwright/test';

export const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'e2e@test.unusonic.com';
export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPass1';

/**
 * Log in via the UI. After this, the page will be at /lobby (or /onboarding).
 */
export async function loginViaUI(page: Page) {
  await page.goto('/login');

  // Fill email
  await page.locator('#email').fill(TEST_EMAIL);

  // Click "Other sign-in options" to get to password field
  // (the default flow tries passkey first)
  const otherOptions = page.getByText('Other sign-in options');
  if (await otherOptions.isVisible({ timeout: 3000 }).catch(() => false)) {
    await otherOptions.click();
  }

  // Fill password
  await page.locator('#password').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#password').fill(TEST_PASSWORD);

  // Submit
  await page.getByText('Sign in with password').click();

  // Wait for navigation away from /login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
}

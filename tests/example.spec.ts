import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/LeadFlow/);
});

test('navigate to leads', async ({ page }) => {
  await page.goto('/');

  // Click the Leads link in the sidebar.
  await page.getByRole('link', { name: 'Leads' }).first().click();

  // Expects page to have a heading with the name of Leads.
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
});

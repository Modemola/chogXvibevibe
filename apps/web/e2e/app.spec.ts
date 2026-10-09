import { type Page, expect, test } from '@playwright/test';
import { privateKeyToAccount } from 'viem/accounts';

// Well-known local test keys; never hold funds.
const primary = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const alt = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const accounts = new Map([primary, alt].map((a) => [a.address.toLowerCase(), a]));

/** Injects an EIP-1193 wallet whose signatures come from viem accounts in the test process. */
async function injectWallet(page: Page, address: string) {
  await page.exposeFunction('__scoutSign', async (hex: `0x${string}`, from: string) => {
    const acct = accounts.get(from.toLowerCase());
    if (!acct) throw new Error(`unknown account ${from}`);
    return acct.signMessage({ message: { raw: hex } });
  });
  await page.addInitScript((initial) => {
    const w = window as unknown as { __scoutAccount: string; __scoutSign: (h: string, a: string) => Promise<string>; ethereum: unknown };
    w.__scoutAccount = initial;
    w.ethereum = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [w.__scoutAccount];
        if (method === 'personal_sign') return w.__scoutSign(params![0] as string, params![1] as string);
        throw new Error(`unsupported ${method}`);
      },
    };
  }, address);
}

const switchAccount = (page: Page, address: string) =>
  page.evaluate((a) => ((window as unknown as { __scoutAccount: string }).__scoutAccount = a), address);

test('home shows live stats', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /ones who stay/ })).toBeVisible();
  await expect(page.getByText('Opted-in profiles')).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Opted-in profiles' }).locator('.n')).not.toHaveText('0');
  await page.screenshot({ path: 'e2e/screens/home.png', fullPage: true });
});

test('opt in, link an alt with both signatures, see it on the profile', async ({ page }) => {
  await injectWallet(page, primary.address.toLowerCase());
  await page.goto('/join');
  await page.getByRole('button', { name: 'Sign and opt in' }).click();
  await expect(page.getByText("You're in.")).toBeVisible();
  // A refresh remembers the connected wallet and that it has joined.
  await page.reload();
  await expect(page.getByText("You're in.")).toBeVisible();

  await switchAccount(page, alt.address.toLowerCase());
  await page.getByLabel('Primary wallet').fill(primary.address);
  await page.getByRole('button', { name: /Sign with the alt/ }).click();
  await expect(page.getByText('Alt signed.')).toBeVisible();

  // Signing as the primary while still on the alt is refused client-side.
  await page.getByRole('button', { name: 'Sign with the primary' }).click();
  await expect(page.getByText(/Switch your wallet to the primary account/).last()).toBeVisible();
  await switchAccount(page, primary.address.toLowerCase());
  await page.getByRole('button', { name: 'Sign with the primary' }).click();
  await expect(page.locator('.notice.ok', { hasText: /^Linked/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/join.png', fullPage: true });

  await page.goto(`/profile/${primary.address}`);
  await expect(page.getByText(/Opted in/)).toBeVisible();
  await expect(page.getByText('Cluster of 2')).toBeVisible();
  await expect(page.locator('.chip', { hasText: 'Alt' }).getByRole('link', { name: alt.address.toLowerCase().slice(0, 6) })).toBeVisible();
});

test('profile explains the score for a simulated wallet', async ({ page, request }) => {
  const launches = await (await request.get('/api/launches')).json();
  const preview = await (
    await request.post('/api/preview', { data: { policy: { version: 1, buckets: [{ id: 'all', weightBps: 10_000 }] }, launch: { launchId: launches[0].id }, slice: '1000', topN: 1 } })
  ).json();
  await page.goto(`/profile/${preview.recipients[0].wallet}?template=hold_or_die`);
  await expect(page.getByText('Templates this wallet matches')).toBeVisible();
  await expect(page.locator('.score-big')).toHaveText(/^-?\d\.\d{3}$/);
  await expect(page.getByRole('cell', { name: /Held past Scout airdrops|Baseline/ }).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/profile.png', fullPage: true });
});

test('policy builder previews live, validates, and exports CSV', async ({ page }) => {
  await page.goto('/builder');
  await expect(page.getByText('Top recipients')).toBeVisible();
  await expect(page.locator('.stat .n').first()).toHaveText(/%$/);

  await page.getByLabel('Template').selectOption('hold_or_die');
  await expect(page.getByRole('cell', { name: 'holders', exact: true })).toBeVisible();

  // Break the weights: the server explains why.
  await page.getByLabel('Weight %').first().fill('10');
  await expect(page.getByText(/must sum to 10000 bps/)).toBeVisible();
  await page.getByLabel('Weight %').first().fill('50');
  await expect(page.getByText(/must sum to 10000 bps/)).toBeHidden();

  // Bad filter field.
  await page.getByLabel('Filter').first().fill('wallet_age > 3');
  await expect(page.getByText(/Unknown field 'wallet_age'/)).toBeVisible();
  await page.getByLabel('Filter').first().fill('dump_score < 0.25');
  await expect(page.getByText(/Unknown field/)).toBeHidden();
  await page.screenshot({ path: 'e2e/screens/builder.png', fullPage: true });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download recipients CSV' }).click();
  const file = await download;
  const content = await (await file.createReadStream())!.toArray();
  expect(Buffer.concat(content).toString().split('\n')[0]).toBe('wallet,amount,score,buckets');
});

test('aftermath card shows who held and who dumped', async ({ page }) => {
  await page.goto('/launches');
  await page.getByRole('link', { name: /Aftermath/ }).first().click();
  await expect(page.getByRole('heading', { name: 'After 1 hour' })).toBeVisible();
  await expect(page.getByText('still held').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recipients' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/aftermath.png', fullPage: true });
});

test('guided tour walks the story with manual controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /tour/i }).first().click();
  const tour = page.getByRole('dialog', { name: 'Guided tour' });
  await expect(tour).toContainText('01/07');
  await tour.getByRole('button', { name: 'Pause tour' }).click();
  await tour.getByRole('button', { name: 'Next step' }).click();
  await expect(tour).toContainText('02/07');
  await tour.getByRole('button', { name: 'Next step' }).click();
  await expect(page).toHaveURL(/\/builder\?.*template=hold_or_die/);
  await expect(tour).toContainText('03/07');
  await tour.getByRole('button', { name: 'Next step' }).click();
  await expect(page).toHaveURL(/\/profile\/0x/);
  await tour.getByRole('button', { name: 'End tour' }).click();
  await expect(tour).toBeHidden();
});

test('works on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/builder');
  await expect(page.getByText('Top recipients')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'e2e/screens/builder-mobile.png', fullPage: true });
});

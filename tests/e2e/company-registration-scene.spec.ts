import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Regression coverage for the employer company-registration page's scene panel.
 *
 * `/company/new` renders through `EditorialFormPage`, whose dark scene column is
 * only mounted when the caller passes `sceneMediaLabel` and
 * `sceneVideoUnavailable`. Those two props were optional and `/company/new`
 * omitted them, so the page rendered a bare column with no photos and no video
 * controls — and nothing caught it: the props were optional, TypeScript was
 * happy, and no E2E spec rendered the authenticated route. This suite signs in
 * as a confirmed employer and asserts the scene media actually mounts.
 *
 * It creates the account through GoTrue's admin API rather than the mail
 * round-trip so the assertion does not depend on the mail catcher. Against the
 * hosted project the local service-role key is absent, so the suite is skipped.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isLocalStack = /(127\.0\.0\.1|localhost|\[::1\])/.test(supabaseUrl);

test.skip(
  !isLocalStack || !serviceRoleKey,
  "Company registration E2E needs the local Supabase stack and its service-role key.",
);

const adminHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

/**
 * Creates a confirmed employer through GoTrue's admin API and returns its id.
 *
 * `email_confirm: true` makes the account a confirmed, active profile — exactly
 * the shape `list_engagement_recipients` selects. The caller deletes the row
 * again so a local `npm run test:db` after `npm run test:e2e` still sees a clean
 * database (the engagement digest suite asserts an exact recipient count).
 */
async function createConfirmedEmployer(
  request: APIRequestContext,
  address: string,
): Promise<string> {
  const response = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: adminHeaders,
    data: {
      email: address,
      password: "Employer-pass-2026",
      email_confirm: true,
      user_metadata: { locale: "en", display_name: "E2E Employer" },
    },
  });
  expect(
    response.ok(),
    `The admin user creation must succeed (got ${response.status()}).`,
  ).toBeTruthy();
  const { id } = (await response.json()) as { id: string };
  return id;
}

async function deleteUser(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  await request.delete(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
    headers: adminHeaders,
  });
}

test("the employer registration page renders the account scene media", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const address = `e2e-employer-scene-${stamp}@example.com`;
  const userId = await createConfirmedEmployer(request, address);

  try {
    await page.goto("/en/login?audience=employer");
    await page.getByLabel("Account email address").fill(address);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Employer-pass-2026");
    await page.getByRole("button", { name: "Employer sign in" }).click();
    // An employer with no company yet is redirected straight through
    // `/company/dashboard` to `/company/new`, so asserting on the dashboard URL
    // races that redirect. Assert the authenticated destination instead.
    await expect(page).toHaveURL(/\/en\/company\/(dashboard|new)/, {
      timeout: 20_000,
    });

    await page.goto("/en/company/new");

    // The regression: without the two props the scene section never mounted, so
    // this locator resolved to zero elements and the column rendered empty.
    const scene = page.locator(".editorial-page-scene-media");
    await expect(scene).toHaveCount(1);
    await expect(scene).toHaveAttribute(
      "aria-label",
      "Northern Cyprus in pictures and video",
    );

    // Four slideshow photos, each carrying a real source.
    const slides = scene.locator(".editorial-page-scene-slide");
    await expect(slides).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(slides.nth(index)).toHaveAttribute(
        "src",
        /\/images\/account-gallery\/.+\.webp/,
      );
    }

    // Three video controls, and selecting one swaps the poster for a <video>.
    const controls = scene.locator(
      ".editorial-page-scene-video-controls button",
    );
    await expect(controls).toHaveCount(3);
    await expect(controls.first()).toBeEnabled();
    await expect(scene.locator("video")).toHaveCount(0);

    await controls.first().click();
    const video = scene.locator("video");
    await expect(video).toHaveCount(1);
    await expect(video.locator('source[type*="av01"]')).toHaveCount(1);
    await expect(video.locator('source[type*="avc1"]')).toHaveCount(1);
    await expect(controls.first()).toHaveAttribute("aria-pressed", "true");

    // The scene copy and the form both survive alongside the media.
    await expect(page.locator("#editorial-page-title")).toBeVisible();
  } finally {
    await deleteUser(request, userId);
  }
});

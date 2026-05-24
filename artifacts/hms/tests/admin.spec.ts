import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@medicare.in";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin123";

function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("input-email").fill(ADMIN_EMAIL);
  await page.getByTestId("input-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("button-submit-login").click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function pickSelectOption(page: Page, triggerLocator: ReturnType<Page["locator"]>, optionText: string | RegExp): Promise<void> {
  await triggerLocator.click();
  await page.getByRole("option", { name: optionText }).first().click();
}

test.describe("Admin module — end-to-end real user flow", () => {
  test("login → staff CRUD with role + joining date → roster Morning/Night/conflict/delete → audit filter+CSV+pagination → admin reports range+charts+CSV", async ({ page }) => {
    test.setTimeout(180_000);

    const staffName = `QA ${uid()}`;
    const staffEmail = `qa-${uid()}@example.com`;
    const staffPhone = `9999${Math.floor(100000 + Math.random() * 899999)}`;
    const today = todayIso();

    // 1) Login as seeded admin
    await loginAsAdmin(page);

    // 2) Staff CRUD: create staff with joining date + role assignment
    await page.goto("/staff");
    await page.getByTestId("button-add-staff").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByTestId("input-name").fill(staffName);
    await dialog.getByTestId("input-joining").fill(today);

    // Role select — first SelectTrigger inside the dialog corresponds to Role
    // (form order: Name, Joining date, Role, Department, ...)
    const roleTrigger = dialog.locator('button[role="combobox"]').nth(0);
    await pickSelectOption(page, roleTrigger, /nurse|doctor|admin|receptionist/i);
    const assignedRole = (await roleTrigger.textContent())?.trim() ?? "";
    expect(assignedRole.length).toBeGreaterThan(0);

    const deptTrigger = dialog.locator('button[role="combobox"]').nth(1);
    await pickSelectOption(page, deptTrigger, /General Medicine/);

    // Email + Phone inputs. The Phone field uses a custom Label (no htmlFor),
    // so address it positionally: it is the first untyped text Input after Email.
    await dialog.locator('input[type="email"]').fill(staffEmail);
    const phoneInput = dialog.locator('input:not([type="email"]):not([type="date"]):not([type="hidden"])').nth(1);
    await phoneInput.fill(staffPhone);

    await dialog.getByTestId("button-save-staff").click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    await page.getByTestId("input-search-staff").fill(staffName);
    const staffRow = page.locator('[data-testid^="row-staff-"]').filter({ hasText: staffName }).first();
    await expect(staffRow).toBeVisible();
    const rowTestId = await staffRow.getAttribute("data-testid");
    expect(rowTestId).toMatch(/^row-staff-\d+$/);

    // 3) Roster: schedule Morning + Night, confirm duplicate conflict, delete
    await page.goto("/roster");
    await page.getByTestId("tab-week").click();

    async function addShift(shiftLabel: RegExp, date: string): Promise<void> {
      await page.getByTestId("button-add-shift").click();
      const d = page.getByRole("dialog");
      await expect(d).toBeVisible();
      // Staff select is the first combobox in the AddShiftDialog
      const staffSelect = d.locator('button[role="combobox"]').nth(0);
      await pickSelectOption(page, staffSelect, new RegExp(`^${staffName}`));
      // Shift select is the second combobox
      const shiftSelect = d.locator('button[role="combobox"]').nth(1);
      await pickSelectOption(page, shiftSelect, shiftLabel);
      await d.locator('input[type="date"]').fill(date);
    }

    await addShift(/^Morning/, today);
    await page.getByTestId("button-save-shift").click();
    await expect(page.getByText("Shift scheduled").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

    await addShift(/^Night/, today);
    await page.getByTestId("button-save-shift").click();
    await expect(page.getByText("Shift scheduled").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

    // Duplicate Morning — expect either a "Cannot schedule" toast or the
    // client-side "scheduling conflicts" warning Card.
    await addShift(/^Morning/, today);
    await page.getByTestId("button-save-shift").click();
    const cannotToast = page.getByText(/Cannot schedule/i).first();
    const conflictCard = page.getByText(/scheduling conflicts/i).first();
    await expect(async () => {
      const a = await cannotToast.isVisible().catch(() => false);
      const b = await conflictCard.isVisible().catch(() => false);
      expect(a || b).toBeTruthy();
    }).toPass({ timeout: 10_000 });

    // Close the dialog if it remained open (server rejection keeps it open).
    // Radix Dialog Escape can be swallowed if focus is on a Select trigger,
    // so click the explicit Cancel button instead.
    if (await page.getByRole("dialog").isVisible().catch(() => false)) {
      await page.getByRole("dialog").getByRole("button", { name: /^Cancel$/ }).click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
    }

    // Delete the Morning shift we just created for OUR staff (deterministic).
    // The roster grid renders one <tr> per staff with their name in the first
    // cell, and shift "pills" containing the shift label + a Delete button.
    // Register the browser-confirm accept handler BEFORE the click — otherwise
    // Playwright's default dismiss would cancel the native confirm().
    page.on("dialog", (d) => { void d.accept().catch(() => undefined); });

    const staffRosterRow = page.locator("tr").filter({ hasText: staffName }).first();
    await expect(staffRosterRow).toBeVisible();

    const morningPill = staffRosterRow.locator("div").filter({ hasText: /^Morning$/ }).first();
    await expect(morningPill).toBeVisible();
    const deleteButtonsForStaff = staffRosterRow.locator('button[aria-label="Delete shift"]');
    const beforeCount = await deleteButtonsForStaff.count();
    expect(beforeCount).toBeGreaterThan(0);

    // Force-click bypasses the opacity-0 group-hover style.
    await morningPill.locator('button[aria-label="Delete shift"]').click({ force: true });

    // Strictly assert the Morning pill for this staff is gone AND row count dropped.
    await expect(staffRosterRow.locator("div").filter({ hasText: /^Morning$/ }))
      .toHaveCount(0, { timeout: 10_000 });
    await expect.poll(async () => deleteButtonsForStaff.count(), { timeout: 10_000 })
      .toBeLessThan(beforeCount);

    // 4) Audit: filter by action + date, export CSV, paginate
    await page.goto("/audit");

    // Action select: 3rd combobox (Entity, Action — Entity is 1st, Action is 2nd inside the filters Card)
    // The audit page has Entity then Action; use accessible names instead.
    const filterCard = page.locator("div.grid").filter({ has: page.getByTestId("input-audit-search") }).first();
    const comboboxes = filterCard.locator('button[role="combobox"]');
    // Entity = 0, Action = 1
    await pickSelectOption(page, comboboxes.nth(1), "create");

    const dateInputs = filterCard.locator('input[type="date"]');
    const fromDate = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    await dateInputs.nth(0).fill(fromDate);
    await dateInputs.nth(1).fill(today);

    // Export CSV — needs at least one row; loosen filters if disabled.
    const exportBtn = page.getByRole("button", { name: /Export CSV/i }).first();
    if (await exportBtn.isDisabled().catch(() => false)) {
      await page.getByRole("button", { name: /Clear filters/i }).click();
    }
    await expect(exportBtn).toBeEnabled({ timeout: 10_000 });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);

    // Pagination — click Next if enabled; otherwise note and skip.
    const nextBtn = page.getByRole("button", { name: /^Next/ });
    if (await nextBtn.isEnabled().catch(() => false)) {
      await nextBtn.click();
      await expect(page.getByText(/Page\s+2/)).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: /^Prev/ }).click();
      await expect(page.getByText(/Page\s+1/)).toBeVisible({ timeout: 10_000 });
    }

    // 5) Admin reports: heading, KPIs, charts, presets, CSV
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: /Reports hub/i })).toBeVisible();

    for (const label of ["OPD visits", "Admissions", "Avg occupancy", "Net revenue", "Collected"]) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }

    // At least one recharts SVG (ResponsiveContainer)
    await expect(page.locator(".recharts-responsive-container svg").first()).toBeVisible({ timeout: 15_000 });

    const reportFromInput = page.locator('input[type="date"]').first();
    const reportToInput = page.locator('input[type="date"]').nth(1);

    await page.getByRole("button", { name: "7d", exact: true }).click();
    await expect.poll(async () => {
      const from = await reportFromInput.inputValue();
      const to = await reportToInput.inputValue();
      if (!from || !to) return -1;
      const days = (Date.parse(to) - Date.parse(from)) / 86400000;
      return Math.round(days);
    }, { timeout: 5_000 }).toBe(6);

    await page.getByRole("button", { name: "90d", exact: true }).click();
    await expect.poll(async () => {
      const from = await reportFromInput.inputValue();
      const to = await reportToInput.inputValue();
      if (!from || !to) return -1;
      const days = (Date.parse(to) - Date.parse(from)) / 86400000;
      return Math.round(days);
    }, { timeout: 5_000 }).toBe(89);

    const reportsExport = page.getByRole("button", { name: /Export CSV/i }).first();
    const [reportsDownload] = await Promise.all([
      page.waitForEvent("download"),
      reportsExport.click(),
    ]);
    expect(reportsDownload.suggestedFilename()).toMatch(/^admin-reports-.+_to_.+\.csv$/);
  });
});

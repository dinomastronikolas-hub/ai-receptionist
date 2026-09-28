import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "correct-horse-42";
const suffix = Date.now().toString(36);
const bob = { name: "Bob", username: `bob_${suffix}`.slice(0, 20), email: `bob.${suffix}@example.com` };

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/today/);
}

test.describe.serial("a new friend joins the crew", () => {
  test("signs up, creates habits and checks one off", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login/); // protected route

    await page.goto("/signup");
    await page.getByLabel("Your name").fill(bob.name);
    await page.getByLabel("Username").fill("alex"); // taken by the demo seed
    await expect(page.getByText("That username is taken")).toBeVisible();
    await page.getByLabel("Username").fill(bob.username);
    await expect(page.getByText("✓ Available")).toBeVisible();
    await page.getByLabel("Email").fill(bob.email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("heading", { name: "Find your crew" })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByText("Your board is empty")).toBeVisible();

    // Create a daily habit
    await page.getByRole("link", { name: "Create a habit" }).click();
    await page.getByLabel("Name").fill("Push-ups");
    await page.getByRole("button", { name: "Create habit" }).click();
    await page.waitForURL(/\/today/);
    await expect(page.getByText("0 of 1 done")).toBeVisible();

    // Private habit
    await page.goto("/habits/new");
    await page.getByLabel("Name").fill("Secret diary");
    await page.getByRole("radio", { name: /Private/ }).click();
    await page.getByRole("button", { name: "Create habit" }).click();
    await page.waitForURL(/\/today/);
    await expect(page.getByText("0 of 2 done")).toBeVisible();

    // Check off, undo, check again — persists across reload
    const check = page.getByRole("checkbox", { name: /Mark Push-ups done today/ });
    await check.click();
    await expect(page.getByText("1 of 2 done")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("0 of 2 done")).toBeVisible();
    await page.getByRole("checkbox", { name: /Mark Push-ups done today/ }).click();
    await expect(page.getByText("1 of 2 done")).toBeVisible();
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByText("1 of 2 done")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Mark Push-ups not done today/ })).toBeChecked();

    // History grid: tap today's square
    await page.getByRole("link", { name: /Push-ups/ }).first().click();
    await expect(page.getByText("1 days").or(page.getByText("1 day")).first()).toBeVisible();
    await page.locator('button[aria-label$=": Completed"]').last().click();
    await expect(page.getByRole("dialog")).toContainText("Completed");
    await page.getByRole("dialog").getByPlaceholder(/How did it go/).fill("20 reps");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Note saved")).toBeVisible();
  });

  test("joins a group by invite link and sees only shared habits", async ({ page }) => {
    await login(page, bob.email, PASSWORD);
    await page.goto("/join/NOTAREALCODE");
    await expect(page.getByRole("heading", { name: "Invite not found" })).toBeVisible();

    await page.goto("/join/tandem-demo");
    await expect(page.getByRole("heading", { name: "Morning Crew" })).toBeVisible();
    await page.getByRole("button", { name: "Join group" }).click();
    await page.waitForURL(/\/group/);
    await expect(page.getByText("Alex").first()).toBeVisible();

    // Alex's profile: public habits visible, private "Journal" never
    await page.getByRole("link", { name: /Alex/ }).first().click();
    await page.waitForURL(/\/people\//);
    await expect(page.getByText("Gym").first()).toBeVisible();
    await expect(page.getByText("Study Spanish").first()).toBeVisible();
    await expect(page.getByText("Journal")).toHaveCount(0);

    // React to someone's check-in
    await page.goto("/group?tab=activity");
    const addReaction = page.getByRole("button", { name: "Add a reaction" }).first();
    await addReaction.click();
    await page.getByRole("button", { name: /^🔥/ }).first().click();
    await expect(page.locator('button[aria-pressed="true"]').first()).toBeVisible();
  });

  test("the group sees the new member's shared habits but not private ones", async ({ page }) => {
    await login(page, "alex@example.com", "tandem-demo-2026");
    await page.goto("/group?tab=habits");
    await expect(page.getByText(bob.name).first()).toBeVisible();
    await expect(page.getByText("Push-ups").first()).toBeVisible();
    await expect(page.getByText("Secret diary")).toHaveCount(0);
  });

  test("a stranger cannot see group members", async ({ page, browser }) => {
    // Outsider signs up and tries to open Alex's profile directly.
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const id = Date.now().toString(36);
    await p.goto("/signup");
    await p.getByLabel("Your name").fill("Eve");
    await p.getByLabel("Username").fill(`eve_${id}`.slice(0, 20));
    await p.getByLabel("Email").fill(`eve.${id}@example.com`);
    await p.getByLabel("Password").fill(PASSWORD);
    await p.getByRole("button", { name: "Create account" }).click();
    await p.getByRole("button", { name: "Skip for now" }).click();
    await p.goto("/people/00000000-0000-4000-a000-00000000a1e1");
    await expect(p.getByText("You can't see this profile")).toBeVisible();
    await ctx.close();
    void page;
  });
});

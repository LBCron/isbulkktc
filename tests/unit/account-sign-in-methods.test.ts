import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  oauthProviderLabels,
  readSignInMethods,
} from "@/features/identity/oauth-providers";
import { deriveDisplayName } from "@/features/identity/oauth-claims";

/**
 * `app_metadata` is what GoTrue reports about an account's linked identities.
 * The account panel reads it to show *how* the visitor signs in — the one thing
 * the profile form cannot tell them, since an account created through Google
 * has no password and one created with an e-mail address has no social
 * identity.
 */
test("readSignInMethods prefers the full providers list", () => {
  assert.deepEqual(
    readSignInMethods({ provider: "email", providers: ["email", "google"] }),
    ["email", "google"],
  );
});

test("readSignInMethods falls back to the single provider", () => {
  // The oldest rows carry only `provider`; without the fallback their account
  // panel would report no sign-in method at all.
  assert.deepEqual(readSignInMethods({ provider: "google" }), ["google"]);
});

test("readSignInMethods tolerates missing and empty metadata", () => {
  assert.deepEqual(readSignInMethods(undefined), []);
  assert.deepEqual(readSignInMethods({}), []);
  assert.deepEqual(readSignInMethods({ providers: [] }), []);
});

test("readSignInMethods de-duplicates repeated providers", () => {
  assert.deepEqual(
    readSignInMethods({ providers: ["google", "google", "email"] }),
    ["google", "email"],
  );
});

test("every enabled OAuth provider has a brand label", () => {
  // The panel falls back to the raw provider id, so a provider added to the
  // enum without a label would surface `linkedin_oidc` to the visitor.
  for (const provider of ["google", "linkedin_oidc"]) {
    assert.ok(
      oauthProviderLabels[provider],
      `${provider} needs a label in oauthProviderLabels`,
    );
  }
});

test("deriveDisplayName follows the provider name precedence", () => {
  // `display_name` is what the sign-up form writes; a provider `full_name`
  // then a bare `name` come next, which is the order `oauth_profile_claims`
  // uses in SQL.
  assert.equal(
    deriveDisplayName({ display_name: "Probe", full_name: "Full", name: "N" }),
    "Probe",
  );
  assert.equal(deriveDisplayName({ full_name: "Amine Karadaban" }), "Amine Karadaban");
  assert.equal(deriveDisplayName({ name: "Muhammed Ali Kahraman" }), "Muhammed Ali Kahraman");
});

test("deriveDisplayName reads a LinkedIn name", () => {
  // LinkedIn sends `name` plus the given/family pair and neither
  // `display_name` nor `full_name`; reading only those two greeted a LinkedIn
  // sign-up with no name at all.
  assert.equal(
    deriveDisplayName({
      name: "Muhammed Ali Kahraman",
      given_name: "Muhammed Ali",
      family_name: "Kahraman",
    }),
    "Muhammed Ali Kahraman",
  );
});

test("deriveDisplayName falls back to the given/family pair", () => {
  assert.equal(
    deriveDisplayName({ given_name: "Hande", family_name: "Kara" }),
    "Hande Kara",
  );
  assert.equal(deriveDisplayName({ given_name: "Hande" }), "Hande");
});

test("deriveDisplayName ignores blank and missing metadata", () => {
  assert.equal(deriveDisplayName(null), null);
  assert.equal(deriveDisplayName(undefined), null);
  assert.equal(deriveDisplayName({}), null);
  assert.equal(deriveDisplayName({ name: "   " }), null);
  assert.equal(deriveDisplayName({ display_name: 42 }), null);
});

test("the apply form can explain an unverified contact address", () => {
  // The RPC refuses the whole submission when the shared address is not
  // verified, and its `22023` is indistinguishable from a closed job. The form
  // and the action both need copy for that state in every locale.
  const inlineKeys = [
    "contactEmailLabel",
    "contactEmailUnverifiedNote",
    "verifyEmailAction",
  ];

  for (const locale of ["tr", "en", "ru", "el", "fa", "de"]) {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../../src/messages/${locale}.json`, import.meta.url),
        "utf8",
      ),
    ) as {
      JobApplication: Record<string, string> & {
        messages: Record<string, string>;
      };
    };

    for (const key of inlineKeys) {
      assert.equal(
        typeof messages.JobApplication[key],
        "string",
        `${locale}.JobApplication.${key} is missing`,
      );
    }

    assert.equal(
      typeof messages.JobApplication.messages.contactEmailUnverified,
      "string",
      `${locale}.JobApplication.messages.contactEmailUnverified is missing`,
    );
  }
});

test("the account panel copy exists in every locale", () => {
  const requiredKeys = [
    "title",
    "emailVerified",
    "emailUnverified",
    "signInMethodsLabel",
    "signInMethodEmail",
    "valueMissing",
  ];

  for (const locale of ["tr", "en", "ru", "el", "fa", "de"]) {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../../src/messages/${locale}.json`, import.meta.url),
        "utf8",
      ),
    ) as { AccountPanel: Record<string, string> };

    for (const key of requiredKeys) {
      assert.equal(
        typeof messages.AccountPanel[key],
        "string",
        `${locale}.AccountPanel.${key} is missing`,
      );
    }

    assert.notEqual(
      messages.AccountPanel.emailVerified,
      messages.AccountPanel.emailUnverified,
      `${locale} must distinguish a verified from an unverified address`,
    );
  }
});

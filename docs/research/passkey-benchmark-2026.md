# Passkey Authentication Benchmark Report

**Date:** 2026-04-04
**Scope:** How the best products in the world implement passkey authentication -- enrollment, sign-in, recovery, multi-device, error handling, and UX patterns.
**Method:** Product-by-product research of shipping implementations, not marketing claims.

---

## Table of Contents

1. [Product-by-Product Analysis](#1-product-by-product-analysis)
2. [Industry Standards and Specifications](#2-industry-standards-and-specifications)
3. [Cross-Cutting Patterns](#3-cross-cutting-patterns)
4. [What Differentiates Good from Great](#4-what-differentiates-good-from-great)
5. [Common Mistakes and Anti-Patterns](#5-common-mistakes-and-anti-patterns)
6. [UX Copy That Works](#6-ux-copy-that-works)
7. [State of Cross-Platform Passkeys in 2026](#7-state-of-cross-platform-passkeys-in-2026)
8. [Recommendations for Unusonic](#8-recommendations-for-unusonic)

---

## 1. Product-by-Product Analysis

### 1.1 GitHub

**Enrollment:**
- Passkey creation offered in **Settings > Password and authentication > Passkeys > "Add a passkey"**.
- Also offered via **feature preview post-login nudge**: after sign-in, GitHub checks if the browser/device can set up a passkey and prompts if no passkey exists for that device.
- Entirely optional. No mandatory enrollment.
- Framing: "Passkeys are a password replacement that validates your identity using touch, facial recognition, a device password, or a PIN." Clear, factual, no marketing fluff.

**Sign-in:**
- Dedicated "Sign in with a passkey" button on the login page at `github.com/login?passkey=true`.
- Browser autofill (conditional mediation) surfaces passkeys on the login page automatically.
- Passkeys satisfy BOTH password AND 2FA in a single step -- this is GitHub's strongest selling point. No second factor prompt after passkey auth.
- Cross-device flow: QR code scan for nearby device authentication is supported.
- Fallback: standard password + 2FA flow remains fully available.

**Account Recovery:**
- If a passkey is registered, it can be used to regain access even if other 2FA methods are lost (because passkey = password + 2FA).
- Recovery codes (one-time use, generated at 2FA setup) are the primary fallback.
- SSH keys and previously verified devices can be used as recovery authentication factors.
- If ALL recovery methods are lost, GitHub support explicitly states they cannot bypass 2FA. This is a hard security line.
- Recommended: register multiple passkeys on different devices.

**Key Insight:** GitHub treats passkeys as a first-class 2FA-satisfying credential. This "two factors in one" framing is the clearest in the industry and eliminates the most friction from the sign-in flow.

---

### 1.2 Google

**Enrollment:**
- Google began prompting all users to create passkeys by default in late 2023. By 2026, passkeys are the default sign-in method for Google accounts.
- Enrollment happens during sign-in flow: Google prompts "Create a passkey" after successful password auth.
- Also available in Google Account > Security > Passkeys.
- Optional but strongly nudged. Google auto-detects the best available method and defaults to it.

**Sign-in:**
- Passkey is the default/primary method. Google's identifier-first flow checks what credentials exist and routes accordingly.
- Conditional mediation (autofill) is fully implemented in Chrome.
- Cross-device: QR code + Bluetooth proximity (caBLE -- cloud-assisted Bluetooth Low Energy). User scans QR on laptop with phone, Bluetooth verifies proximity, actual auth data travels over encrypted internet connection.
- Fallback: password, one-time codes, backup codes all remain available. Adding a passkey does NOT remove existing recovery/auth methods.

**Account Recovery:**
- Passkeys do not replace or remove any existing recovery factors.
- Standard Google recovery: backup email, phone number, recovery codes.
- Password remains as a fallback even after passkey enrollment.

**Multi-device:**
- Google Password Manager syncs passkeys across all devices signed into the same Google account.
- Works on Android 9+, ChromeOS 109+, and Chrome on other platforms.
- Cross-platform: user on iPhone can authenticate on an Android device via QR code + Bluetooth.

**Key Insight:** Google's scale (800M+ accounts using passkeys, 2.5B passkey sign-ins) makes them the definitive proof that passkeys work at scale. Their "don't remove anything, just add passkeys on top" approach is the safest migration strategy.

---

### 1.3 Apple

**Enrollment:**
- Passkeys are created automatically when signing up for a service that supports them via Safari or native apps.
- Stored in iCloud Keychain, synced across all Apple devices signed into the same Apple ID.
- The standalone **Passwords app** (iOS 18+) provides visibility into stored passkeys.

**Sign-in:**
- Safari autofill surfaces passkeys alongside passwords in the same familiar dropdown.
- Native apps use the ASAuthorizationController API for system-level passkey prompts.
- Face ID / Touch ID / device passcode for verification.

**WWDC 2025 -- Five Major Updates:**
1. **Account Creation API:** Pre-filled sheet showing name, email, passkey. One tap + Face ID = account created. Eliminates the entire sign-up form.
2. **Automatic Passkey Upgrades:** When a user signs in with a password, the system silently creates a passkey in the background. `requestStyle: .conditional` parameter. No extra user interaction required.
3. **Signal APIs:** Apps can notify credential managers when usernames change, which passkeys are still valid, or when passwords are no longer needed. Solves the "stale credential" problem.
4. **Passkey Management Endpoints:** `.well-known` URI with JSON file lets credential managers surface "add passkey" buttons inside their UI.
5. **Secure Passkey Transfer:** CXF-based app-to-app credential transfer on iOS/iPadOS/macOS/visionOS 26. Already shipping.

**Key Insight:** Apple's automatic passkey upgrade is the most significant UX innovation in the passkey space. Users never have to "decide" to create a passkey -- it happens silently when they use a password. This solves the adoption problem at the infrastructure level.

---

### 1.4 Shopify (Shop Pay)

**Enrollment:**
- Passkey enrollment integrated directly into the Shop Pay checkout flow.
- Deployed to 100M+ Shop users starting December 2022.
- Replaced email and SMS verification codes with passkeys.

**Sign-in:**
- **Conditional UI** is central to Shopify's strategy. When a user visits any Shopify-powered storefront, the browser autofill suggests their Shop passkey automatically.
- This is the largest Conditional UI deployment in the world.
- Shop Pay auto-populates shipping and payment details after passkey authentication -- the passkey isn't just auth, it's the gateway to the entire checkout acceleration.

**Technical Details:**
- Uses `excludeCredentials` property to prevent duplicate passkey registrations per account.
- Credential Manager API + RxJava on Android.
- Cross-platform via Google Password Manager and iCloud Keychain sync.

**Key Insight:** Shopify proves that passkeys work best when they unlock more than just authentication. Tying passkey auth to instant checkout (shipping + payment auto-fill) creates a tangible reward that drives adoption organically.

---

### 1.5 KAYAK

**Enrollment:**
- Passkey setup available in Account page settings.
- Was one of the first adopters (September 2022, simultaneous with public passkey release).
- Two-thirds of new users opt for passkeys -- the highest voluntary adoption rate publicly reported.

**Sign-in:**
- **Conditional UI** with autofill: passkeys appear in the autofill dropdown when the user clicks the username field.
- Uses `excludeCredentials` to prevent multiple passkeys per account on the same device.
- Replaced passwords entirely with verification codes + optional passkeys.

**Results:**
- 50% reduction in sign-up and sign-in time.
- Measurable decrease in support tickets.

**Key Insight:** KAYAK demonstrates that early adoption pays off -- two-thirds of new users choosing passkeys is remarkable. Their decision to pair passkeys with verification codes (not passwords) as the fallback is forward-thinking.

---

### 1.6 Best Buy

**Enrollment:**
- Passkey enrollment only available in Account Settings after creating a traditional username/password account.
- Built their own DIY passkey solution.
- Result: **only 3% adoption** despite months of development.

**Sign-in:**
- After enrollment, "Sign in with a Passkey" option appears on the login page.
- Conservative implementation -- password-first, passkey as optional add-on.

**Key Insight:** Best Buy is the canonical cautionary tale. Burying passkey enrollment in settings with no post-login nudge, no conditional UI, and no value proposition beyond "it's faster" produces single-digit adoption. This is the anti-pattern.

---

### 1.7 1Password

**Enrollment:**
- 1Password acts as a **third-party passkey provider**, storing passkeys in the 1Password vault alongside passwords.
- On Android, the system prompts users to choose which credential manager stores the passkey during enrollment.
- Windows 11 24H2: native passkey plugin system allows 1Password to register as a system-level passkey provider (requires MSIX build).

**Cross-Platform:**
- Full passkey sync across Windows, macOS, iOS, Android via 1Password vault.
- This is 1Password's strongest differentiator: platform-agnostic passkey storage that works everywhere.
- Bridges Apple/Google/Microsoft ecosystems -- a user with iPhone + Windows PC can use passkeys stored in 1Password on both.

**2026 Status:**
- "True passkey leader" -- enables near-complete passwordless experience across sites.
- Pasted Login Phishing Defense: warns if credentials are manually pasted into a fraudulent site.

**Key Insight:** Third-party passkey managers solve the cross-platform problem that platform vendors (Apple, Google, Microsoft) create by default. Any passkey implementation MUST account for users who store passkeys in 1Password/Bitwarden/Dashlane rather than the platform keychain.

---

### 1.8 Linear

**Enrollment:**
- Passkey registration in **Preferences > Account > Security & Access**.
- Supports registering multiple devices.
- Admins can require specific login methods for all workspace members (organization-level enforcement).

**Sign-in:**
- Passkeys supported alongside email magic links, Google SSO, and SAML SSO.
- Clean, minimal UI consistent with Linear's design philosophy.

**Key Insight:** Linear's admin-level enforcement of login methods is relevant for B2B. The ability for workspace admins to require passkeys (or at least specific auth methods) is a pattern Unusonic should consider given its multi-workspace model.

---

### 1.9 Vercel

**Enrollment:**
- Passkey creation available in **Account Settings > Authentication > Add New > Passkey**.
- NOT offered during sign-up. Settings-only enrollment.
- Uses `excludeCredentials` to prevent duplicate passkeys per device.

**Sign-in:**
- Supports usernameless authentication (no email required first).
- Does NOT implement Conditional UI (no autofill integration as of analysis date).
- Cross-device auth via QR code works, but Chrome profile-stored passkeys have a known issue with missing `userHandle` in assertion responses.

**Limitations:**
- Early-stage rollout. No post-login nudge, no conditional UI.
- Hybrid approach with email magic links as the primary passwordless method.

**Key Insight:** Vercel's implementation is notably conservative for a developer-focused platform. The absence of Conditional UI and post-login nudges suggests passkeys are still secondary to magic links in their auth strategy.

---

### 1.10 Stripe Dashboard

**Enrollment:**
- Post-login: navigate to profile settings, click "Add a passkey."
- Browser-guided ceremony: verify identity via Touch ID, Face ID, Windows Hello, or PIN.
- Optional, not mandatory.
- Framing: "one-click login" -- emphasizes speed, not security, as the primary benefit.

**Sign-in:**
- Passkeys positioned as a speed upgrade for an already-secure environment.
- Supports Touch ID, Face ID, Windows Hello, device PIN, hardware security keys.
- Full browser support documentation published at `support.stripe.com`.

**Security Context:**
- Stripe uses a redirect-based approach for passkeys rather than embedded SDK -- this is intentional for their payment SDK where third-party checkout contexts are common.
- Passkeys complement, don't replace, existing MFA.

**Key Insight:** Stripe frames passkeys as a convenience upgrade for financial professionals who already have strong auth habits. The "one-click login" framing (speed, not security) works well for power users.

---

### 1.11 Microsoft (Bonus -- too significant to omit)

**Enrollment:**
- As of May 2025: **all new Microsoft accounts are passwordless by default**. New users never create a password.
- Enrollment flow: create account > prompted to enroll passkey > subsequent sign-ins default to passkey.
- The system auto-detects the best available method and sets it as default.

**Scale:**
- 1 million daily passkey registrations globally (350% increase from 2024).
- Passkey sign-ins are 8x faster than password + MFA.

**Key Insight:** Microsoft is the first major platform to make passkeys the default for NEW accounts (not just existing ones). This is the most aggressive passkey-first posture in the industry.

---

## 2. Industry Standards and Specifications

### 2.1 W3C WebAuthn Level 3

- **Status:** Candidate Recommendation Snapshot published January 13, 2026.
- Web Authentication Working Group rechartered through April 2026.
- Key additions: improved attestation handling, enhanced cross-device flows, better error reporting.

### 2.2 FIDO Alliance Design Guidelines

- 14 design patterns informed by usability research.
- 10 UX principles + 3 content principles.
- Figma UI kits available.
- Updated annually; 2025 update added guidance on passkey management and integrating synced vs. device-bound passkeys.
- Published at `passkeycentral.org/design-guidelines/`.

**Key FIDO UX Research Findings:**
- Passkeys achieve **93% login success rate** vs. 63% for other methods.
- Average passkey login: **8.5 seconds** vs. 31.2 seconds for MFA (73% reduction).
- Prominently displaying passkey options in account settings alongside other auth methods, with consistent styling and clear messaging, most effectively motivates passkey creation.

### 2.3 FIDO CXP/CXF (Credential Exchange)

- **CXF (Credential Exchange Format):** Approved as FIDO Proposed Standard, August 2025. JSON-based format for passwords, passkeys, TOTP secrets, SSH keys, Wi-Fi credentials, API keys, notes.
- **CXP (Credential Exchange Protocol):** Targets early 2026 standardization. Uses HPKE (Hybrid Public Key Encryption) for end-to-end protected credential transfer.
- **Active contributors:** Apple, Google, Microsoft, 1Password, Bitwarden, Dashlane.
- **Apple already ships CXF-based same-device credential transfer in iOS/macOS 26.**

### 2.4 NIST SP 800-63-4 (July 2025)

- Requires that AAL2 (multi-factor authentication) **must offer a phishing-resistant option**.
- This effectively mandates passkey support for any system claiming AAL2 compliance.

### 2.5 Adoption Statistics (Early 2026)

- **15 billion online accounts** now support passkeys.
- **87% of enterprises** surveyed by FIDO Alliance have deployed or are actively deploying passkeys.
- **Google:** 800M accounts using passkeys, 2.5B passkey sign-ins.
- **Microsoft:** 1M daily passkey registrations.
- **Gartner:** expects passkeys to become the main authentication method by 2027.
- **Retail dominates passkey traffic:** e-commerce accounts for nearly half of all passkey authentications (Amazon alone = 39.9%).

---

## 3. Cross-Cutting Patterns

### 3.1 What the Best Implementations Do Consistently

**Identifier-First Flow:**
Every top implementation (Google, GitHub, Shopify) uses an identifier-first approach: user enters email/username, system determines available auth methods, routes accordingly. This is the consensus best practice.

**Conditional UI / Autofill:**
The best implementations (GitHub, Google, Shopify, KAYAK) all use `autocomplete="username webauthn"` to surface passkeys in the browser's autofill dropdown. This is the single most impactful UX pattern -- it puts passkeys where users already look.

**Additive, Not Replacement:**
Google, GitHub, and Stripe all add passkeys on top of existing auth methods. No product removes passwords or other factors when passkeys are enrolled. This is critical for user confidence.

**Two-Factor Satisfaction:**
GitHub's pattern of counting passkeys as both password AND 2FA is the gold standard for reducing friction. Passkey = done, no second prompt.

**Graceful Degradation:**
Every good implementation maintains a complete fallback path. Passkey fails? Here's password. Password fails? Here's recovery codes. The chain never breaks.

### 3.2 Enrollment Timing Hierarchy (Most to Least Effective)

| Strategy | Adoption Rate | Example |
|---|---|---|
| Default for new accounts (no password created) | Highest | Microsoft |
| Automatic silent upgrade during password sign-in | Very high | Apple (iOS 26+) |
| Post-login prompt after successful password auth | High | Google, GitHub (feature preview) |
| In-checkout / in-workflow enrollment | High | Shopify |
| Dedicated prompt on first visit to security settings | Medium | Stripe |
| Passive availability in settings only | Very low (3%) | Best Buy, Vercel |

**The data is unambiguous:** passive settings-only enrollment produces single-digit adoption. Post-login prompts and in-flow enrollment are 10-30x more effective.

### 3.3 Cross-Device Authentication Flow

The standard cross-device flow (implemented by all major browsers):

1. User clicks "Use a passkey from another device" (or similar).
2. Browser displays a QR code.
3. User scans QR with phone/tablet that has the passkey.
4. Bluetooth proximity check (caBLE) verifies devices are physically nearby.
5. User authenticates on phone (Face ID / Touch ID / PIN).
6. Authentication data travels over encrypted internet connection (not Bluetooth).
7. Browser completes sign-in.

**Requirements:** Bluetooth 4.0+ on both devices. Private keys never leave the authenticator device.

### 3.4 Recovery Architecture Tiers

| Tier | Method | Who Does It |
|---|---|---|
| Tier 0 | Synced passkeys (iCloud/Google/1Password) | Apple, Google, Microsoft |
| Tier 1 | Multiple registered passkeys on different devices | GitHub, Linear, all |
| Tier 2 | Recovery codes (generated at enrollment) | GitHub, Google |
| Tier 3 | Fallback to password + 2FA | Google, GitHub, Stripe |
| Tier 4 | Account recovery via verified email/phone | Google, Microsoft |
| Tier 5 | Social/guardian recovery | Unusonic (sovereign recovery) |
| Tier 6 | Support intervention | Limited -- most refuse to bypass 2FA |

**No major platform uses social/guardian recovery for passkeys.** Unusonic's sovereign recovery (BIP39 + Shamir 2-of-3 + guardian shards) is genuinely novel in this space.

---

## 4. What Differentiates Good from Great

### Great: GitHub

- Passkey = password + 2FA in one step. No second factor prompt.
- Post-login feature preview nudge for passkey creation.
- Clear recovery hierarchy with multiple fallback options.
- Explicit "we cannot bypass 2FA" stance builds trust.

### Great: Apple (iOS 26+)

- Automatic passkey upgrades during password sign-in (zero friction).
- Account Creation API eliminates sign-up forms.
- Signal APIs keep credential managers in sync.
- CXF transfer already shipping.

### Great: Shopify

- Passkeys unlock tangible value (instant checkout with auto-filled payment/shipping).
- Largest Conditional UI deployment in production.
- Passkey enrollment embedded in the commerce workflow, not isolated in settings.

### Good but not great: Stripe

- Clean enrollment in settings, good framing ("one-click login").
- But no Conditional UI, no post-login nudge, no in-flow enrollment.

### Good but not great: Linear

- Admin enforcement is valuable for B2B.
- But basic settings-only enrollment, no nudge.

### Weak: Best Buy, Vercel

- Settings-only enrollment with no nudge = 3% adoption.
- No Conditional UI.
- No tangible value proposition beyond "faster."

---

## 5. Common Mistakes and Anti-Patterns

### 5.1 Settings-Only Enrollment

Burying passkey creation in security settings without any in-flow prompt or post-login nudge guarantees low adoption. Best Buy's 3% is the reference data point.

### 5.2 No Conditional UI

Failing to implement `autocomplete="username webauthn"` means passkeys are invisible to users who don't specifically seek them out. This is the most common missed opportunity.

### 5.3 Vague Error Messages

WebAuthn errors are notoriously opaque. Common failure: browser returns `NotAllowedError` which could mean the user cancelled, the OS blocked the request, or the authenticator timed out. Products that map these to user-friendly messages (and differentiate cancellation from failure) have significantly better completion rates.

### 5.4 No Cancellation Detection

When a user cancels the WebAuthn ceremony (dismisses the biometric prompt), the worst implementations treat it as an error. The best (including Unusonic's current implementation) detect cancellation via `/canceled|cancelled|NotAllowedError|AbortError/` and show a soft hint rather than an error state.

### 5.5 Ignoring Third-Party Password Managers

Password manager browser extensions (1Password, Bitwarden, Dashlane, NordPass) can:
- Modify the DOM and overwrite `autocomplete` attributes.
- Intercept the WebAuthn ceremony.
- Store passkeys in their own vault instead of the platform keychain.

Products that test only with platform authenticators and not third-party managers ship broken experiences for a significant user segment.

### 5.6 No Fallback Chain

Passkey-only with no graceful fallback = locked-out users. Every implementation needs at minimum: passkey > password > recovery code > account recovery.

### 5.7 Corporate/Managed Device Blindness

Enterprise-managed Windows devices frequently have WebAuthn restricted or configured differently by IT policy. Products that don't detect this and fall back gracefully produce silent failures. The most common cause of passkey failures on Windows is configuration, not code.

### 5.8 Incognito/Private Browsing

Chrome 129+: passkey CREATION is broken in incognito mode with platform authenticators (unintended side effect of enabling passkey login in incognito). Passkey authentication works fine. Products need to either detect incognito mode and skip creation prompts, or handle the error gracefully.

---

## 6. UX Copy That Works

### Enrollment Prompts

**GitHub:** "Passkeys are a password replacement that validates your identity using touch, facial recognition, a device password, or a PIN."
-- Factual, no jargon, lists concrete methods.

**FIDO Alliance recommendation:** "Sign in faster with a passkey. Use your fingerprint, face, or screen lock -- no password needed."
-- Leads with benefit (faster), follows with familiar methods.

**Google:** "Create a passkey" (button text). "Passkeys let you sign in with your fingerprint, face, or screen lock."
-- Minimal. Trusts the user.

**Stripe:** "One-click login" (headline). "Sign in faster with Touch ID, Face ID, or your security key."
-- Speed-first framing for power users.

### Sign-In States

**Best practice for "waiting for passkey":** "Waiting for passkey..." (Unusonic currently uses this -- good).
**After cancellation:** "Try signing in with your password" (soft hint, not error).
**After failure:** Show error, auto-expand fallback method.

### Error Messages

**Good (specific):** "Your passkey wasn't recognized. Try using your password instead."
**Bad (vague):** "Authentication failed. Please try again."
**Good (cancellation-aware):** [no error shown, soft hint to try password]
**Bad (cancellation):** "Error: The operation was cancelled by the user."

### Recovery Language

**GitHub:** "Lost your two-factor device? Use a recovery code or start account recovery."
**Good general pattern:** "Lost access?" (link to recovery flow) -- simple, non-alarming.

### Content Principles (FIDO Alliance)

1. Treat "passkey" as a common noun (like "password"). Not "Passkey" or "PassKey."
2. Associate the unfamiliar (passkey) with the familiar (fingerprint, face, PIN).
3. Keep "what" and "where" information visible -- don't hide it behind clicks.
4. Name passkeys by device/location to help users identify them in lists.

---

## 7. State of Cross-Platform Passkeys in 2026

### Platform Passkey Storage

| Platform | Passkey Storage | Sync Scope |
|---|---|---|
| Apple | iCloud Keychain / Passwords app | All Apple devices on same Apple ID |
| Google | Google Password Manager | Android, ChromeOS, Chrome on any OS |
| Microsoft | Windows Hello | Windows devices only (expanding) |
| 1Password | 1Password vault | All platforms (best cross-platform) |
| Bitwarden | Bitwarden vault | All platforms |
| Dashlane | Dashlane vault | All platforms |

### Cross-Platform Gaps

- **iPhone user with Windows PC:** Platform passkeys don't sync. Must use QR + Bluetooth cross-device flow OR a third-party manager (1Password, Bitwarden).
- **Android user with Mac:** Same issue. Google Password Manager passkeys don't sync to macOS Keychain.
- **Corporate Windows + personal iPhone:** Managed Windows may block WebAuthn; cross-device via Bluetooth requires both devices to be present.

### What's Solving It

1. **Third-party passkey managers** (1Password, Bitwarden) provide true cross-platform sync.
2. **Windows 11 24H2 passkey plugin system** allows third-party managers to act as system-level passkey providers.
3. **FIDO CXP/CXF** will enable secure credential transfer between providers (CXF approved Aug 2025, CXP targeting early 2026).
4. **Apple CXF-based transfer** already shipping in iOS/macOS 26.

### Browser Support Matrix (2026)

| Browser | Conditional UI | Cross-Device | Platform Auth | Third-Party Providers |
|---|---|---|---|---|
| Chrome | Yes | Yes (caBLE) | Yes | Yes (Win 11 24H2+) |
| Safari | Yes | Yes | Yes | Yes (iOS 26+) |
| Edge | Yes | Yes | Yes (most stable) | Yes (Win 11 24H2+) |
| Firefox | Yes (v122+) | Limited | Yes | Limited |

---

## 8. Recommendations for Unusonic

Based on this benchmark, here is where Unusonic's current implementation stands and what to consider.

### What Unusonic Already Does Well

1. **Conditional mediation** via `autocomplete="username webauthn"` with the 220ms delay for password manager compatibility -- this is a sophistication most implementations miss.
2. **Cancellation-aware error handling** that distinguishes `NotAllowedError`/`AbortError` from real failures, showing a soft hint instead of an error. This matches GitHub's approach.
3. **Identifier-first flow** with "Continue" CTA that triggers passkey auth, falling back to password form on failure. This is the FIDO-recommended pattern.
4. **Sovereign recovery** (BIP39 + Shamir + guardians) is genuinely novel. No major platform offers social recovery for passkeys. This could become a differentiator if positioned correctly.
5. **"Waiting for passkey..." loading state** with spinner -- clean and informative.
6. **"Other sign-in options"** as the password fallback link -- non-alarming, progressive disclosure.

### Opportunities Based on Benchmark

**High Impact:**

1. **Post-login passkey enrollment nudge.** The `RecoveryBackupPrompt` pattern (7-day delay, dismissible) already exists for sovereign recovery. Apply the same pattern for passkey creation: if a user signs in with a password and has no passkey for this device, prompt post-login. This is the single highest-leverage change based on adoption data (settings-only = 3%, post-login prompt = significantly higher).

2. **Automatic passkey upgrade (Apple-style).** When a user signs in with a password, silently create a passkey in the background if the browser supports it. This eliminates enrollment friction entirely. Apple's `requestStyle: .conditional` is the reference implementation. On the web, this would mean calling `navigator.credentials.create()` with appropriate options after a successful password sign-in, without showing a modal.

3. **Admin-level auth enforcement (Linear-style).** Allow workspace admins to require passkeys or specific auth methods for all workspace members. Relevant for enterprise customers.

**Medium Impact:**

4. **Passkey naming.** When users register passkeys, auto-generate a name based on device/browser (e.g., "Chrome on MacBook Pro"). Show named passkeys in a list in security settings. Helps users manage multiple passkeys.

5. **Multiple passkey registration encouragement.** After first passkey creation, suggest registering on additional devices. "You have 1 passkey registered. For uninterrupted access, add a passkey on another device."

6. **Incognito mode detection.** Don't offer passkey creation (but allow passkey sign-in) in incognito/private browsing. Chrome 129+ has a known issue with passkey creation in incognito.

**Lower Impact but Worth Noting:**

7. **CXF export** is already partially implemented (`/api/auth/identity/export`). As CXP standardizes, ensure compatibility with the FIDO format for credential portability.

8. **`.well-known/passkey-endpoints`** JSON file to allow credential managers (1Password, Bitwarden) to surface "add passkey" buttons for Unusonic inside their UI. This is a new Apple/FIDO pattern with near-zero implementation cost.

### Unusonic's Sovereign Recovery as Differentiator

Unusonic's guardian-based recovery is architecturally more sophisticated than anything in the benchmark. The closest analog is GitHub's "register multiple passkeys" recommendation, but that's a hedge, not a recovery system.

Positioning suggestion: frame sovereign recovery not as "what to do when passkeys break" but as "your account belongs to you, not to Apple/Google/Microsoft." This resonates with the B2B production company audience that values independence from platform lock-in.

---

## Sources

- [GitHub Passkey Docs -- Signing In](https://docs.github.com/en/authentication/authenticating-with-a-passkey/signing-in-with-a-passkey)
- [GitHub Passkey Docs -- About Passkeys](https://docs.github.com/en/authentication/authenticating-with-a-passkey/about-passkeys)
- [GitHub Passkey Docs -- Managing Passkeys](https://docs.github.com/en/authentication/authenticating-with-a-passkey/managing-your-passkeys)
- [GitHub Blog -- Introducing Passwordless Authentication](https://github.blog/news-insights/product-news/introducing-passwordless-authentication-on-github-com/)
- [GitHub Docs -- Recovering Account After Losing 2FA](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/recovering-your-account-if-you-lose-your-2fa-credentials)
- [Google -- Sign in with a Passkey](https://support.google.com/accounts/answer/13548313?hl=en)
- [Google Developers -- Passkey Support](https://developers.google.com/identity/passkeys/supported-environments)
- [Google Developers -- Passkey Use Cases](https://developers.google.com/identity/passkeys/use-cases)
- [Google Developers -- Passkey UI Design](https://developers.google.com/identity/passkeys/ux/user-interface-design)
- [Google Safety -- Passkey Authentication](https://safety.google/safety/authentication/passkey/)
- [Apple Support -- Use Passkeys on iPhone](https://support.apple.com/guide/iphone/use-passkeys-to-sign-in-to-websites-and-apps-iphf538ea8d0/ios)
- [Apple Developer -- What's New in Passkeys (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/279/)
- [Apple Developer -- Supporting Passkeys](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys)
- [AuthSignal -- Apple WWDC25 Passkey Updates](https://www.authsignal.com/blog/articles/apples-wwdc25-passkey-updates-fast-forwarding-the-journey-to-passwordless)
- [Corbado -- WWDC25 Passkeys Analysis](https://www.corbado.com/blog/wwdc25-passkeys-os26)
- [Shopify Engineering -- Supporting Passkeys in Shop](https://shopify.engineering/supporting-passkeys-in-shop-authentication-flows)
- [Shopify Blog -- Ecommerce Payment Authentication](https://www.shopify.com/blog/ecommerce-payment-authentication)
- [FIDO Alliance -- Shopify Deployment](https://fidoalliance.org/comm_deployment/shopify/)
- [Corbado -- Shopify Passkey Analysis](https://www.corbado.com/blog/shopify-passkeys-best-practices-analysis)
- [Google Developers Blog -- KAYAK Passkey Implementation](https://developers.googleblog.com/how-kayak-reduced-sign-in-time-by-50-and-improved-security-with-passkeys/)
- [Corbado -- KAYAK Passkey Analysis](https://www.corbado.com/blog/kayak-passkeys-best-practices-analysis)
- [Passkeys Directory -- Best Buy](https://passkeys.directory/details/best-buy)
- [1Password Community -- Credential Exchange Standard](https://www.1password.community/blog/developer-blog/portability-without-compromise-1password-helps-author-a-new-standard-for-secure-/163208)
- [Corbado -- 1Password Passkey Analysis](https://www.corbado.com/blog/1password-passkeys-best-practices-analysis)
- [Linear Docs -- Login Methods](https://linear.app/docs/login-methods)
- [Corbado -- Vercel Passkeys Launch Analysis](https://www.corbado.com/blog/vercel-passkeys-launch)
- [Vercel Docs -- Account Management](https://vercel.com/docs/accounts)
- [Stripe Blog -- Passkeys for Dashboard](https://stripe.com/blog/passkeys-a-faster-more-secure-way-to-log-in-to-the-stripe-dashboard)
- [Stripe Support -- Passkey Setup](https://support.stripe.com/questions/set-up-a-passkey-for-one-click-login)
- [Stripe Support -- Passkey Sign-In](https://support.stripe.com/questions/sign-in-using-a-passkey)
- [Microsoft Security Blog -- Pushing Passkeys Forward](https://www.microsoft.com/en-us/security/blog/2025/05/01/pushing-passkeys-forward-microsofts-latest-updates-for-simpler-safer-sign-ins/)
- [W3C -- WebAuthn Level 3 Specification](https://www.w3.org/TR/webauthn-3/)
- [FIDO Alliance -- Design Guidelines (Passkey Central)](https://www.passkeycentral.org/design-guidelines/)
- [FIDO Alliance -- Credential Exchange Specifications](https://fidoalliance.org/specifications-credential-exchange-specifications/)
- [FIDO Alliance -- Passkey Index 2025](https://fidoalliance.org/passkey-index-2025/)
- [State of Passkeys -- Adoption Statistics 2026](https://state-of-passkeys.io)
- [Corbado -- WebAuthn Conditional UI](https://www.corbado.com/blog/webauthn-conditional-ui-passkeys-autofill)
- [Chrome Developers -- WebAuthn Conditional UI](https://developer.chrome.com/docs/identity/webauthn-conditional-ui)
- [web.dev -- Passkey Form Autofill](https://web.dev/articles/passkey-form-autofill)
- [Corbado -- QR Code and Bluetooth Hybrid Transport](https://www.corbado.com/blog/webauthn-passkey-qr-code)
- [Corbado -- Passkeys in Incognito Mode](https://www.corbado.com/blog/passkeys-incognito-mode)
- [Security Boulevard -- Device-Level Limitations](https://securityboulevard.com/2026/03/why-passkeys-dont-work-on-some-devices-device-level-limitations/)
- [Passkey Central -- Cross-Device Troubleshooting](https://www.passkeycentral.org/troubleshooting/cross-device-sign-in)
- [Bitwarden -- Passkey Backup and Recovery](https://bitwarden.com/resources/passkey-backup-and-recovery/)
- [AuthSignal -- Passkey Recovery and Fallback](https://www.authsignal.com/blog/articles/passkey-recovery-fallback)

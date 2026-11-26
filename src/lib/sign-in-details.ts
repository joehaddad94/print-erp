/**
 * The ready-to-send text an owner copies after adding a person or resetting
 * their password (Settings → People). Plain text so it pastes cleanly into
 * WhatsApp, SMS or email.
 */
export function signInDetailsText({
  username,
  password,
  signInUrl,
}: {
  username: string;
  password: string;
  signInUrl?: string;
}): string {
  return [
    "Your Print Shop sign-in",
    signInUrl ? `Link: ${signInUrl}` : null,
    `Username: ${username}`,
    `One-time password: ${password}`,
    "You'll choose your own password when you sign in.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

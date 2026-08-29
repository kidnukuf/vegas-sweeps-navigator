export type CoordinatorInvitationEmailInput = {
  code: string;
  recipientName?: string | null;
  eventName: string;
  centerName: string;
  signupUrl: string;
  closingSignature?: string | null;
};

export function buildCoordinatorInvitationEmail(input: CoordinatorInvitationEmailInput) {
  const greeting = input.recipientName?.trim() ? `Hello ${input.recipientName.trim()},` : "Hello,";
  const signature = input.closingSignature?.trim() || "The Bowl Vegas Team";
  return {
    subject: `Coordinator access for ${input.eventName}`,
    body: `${greeting}

You are invited to create a Bowl Vegas Coordinator account for ${input.centerName} in ${input.eventName}.

Your one-time verification code is: ${input.code}

This code expires 72 hours after it was created and becomes invalid immediately after it is used. Please do not forward or share it.

To sign in:
1. Open ${input.signupUrl}
2. Choose the coordinator invitation sign-up option.
3. Enter the verification code above, then create your account with your email address and password.
4. Provide your first and last name, center phone number and extension. You may also add a direct or mobile contact method.

Your role is to provide and complete the bowlers’ event information for your assigned center and league sessions. You can begin with the roster basics—first and last name, center, league day/time, team number or name, captain, email, and phone—and return later to complete additional details. The Event Director can review and audit your submitted information. The Owner alone performs the initial and final app import and creates app-generated records such as claim codes.

Bowl Vegas gives bowlers and captains one place to view their event information, access event tools, communicate through role-appropriate in-app channels, and coordinate with attendees from their own center. Your early roster work helps the Event Director prepare a controlled Owner import without requiring you to manage app-generated codes or production imports.

If you need help with the code or your assigned scope, contact your Event Director.

Thank you,
${signature}`,
  };
}

export function coordinatorSignupUrl(origin: string, code: string) {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("A secure coordinator sign-in address is required.");
  url.pathname = "/coordinator";
  url.search = "";
  url.searchParams.set("code", code);
  return url.toString();
}

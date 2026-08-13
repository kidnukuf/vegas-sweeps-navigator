# Google Sheets Onboarding Research

## Recommended credential approach

Google documents that a service-account private key is a credential comparable to a password and recommends reducing the number of keys in circulation, avoiding passing keys between users, and rotating keys when necessary. This supports using one securely managed app-level service account rather than issuing a JSON key to each Event Director.

For direct access to specific Sheets, Google states that a Sheet or Drive folder can be shared directly with the service account email address at the required access level; no domain-wide delegation is required for that scenario.

## Sources

- Google Cloud IAM, “Best practices for managing service account keys”: https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys
- Google Workspace Developers, “Create access credentials”: https://developers.google.com/workspace/guides/create-credentials

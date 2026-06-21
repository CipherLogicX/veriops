# VeriOps Security

## Authentication

VeriOps uses email and password authentication through the backend API.

Passwords are hashed with bcrypt and are never stored in plaintext.

JWT access tokens are used for authenticated API access.

The first administrator account is created from environment variables during initial startup.

Required bootstrap variables:

- FIRST_ADMIN_EMAIL
- FIRST_ADMIN_PASSWORD
- FIRST_ADMIN_NAME

No application users are hardcoded in the source code.

## Authorization

VeriOps uses role-based access control and project-level permissions.

Supported roles:

- SUPER_ADMIN
- PROJECT_MANAGER
- QA_LEAD
- TESTER
- VIEWER

Authorization is enforced on the backend.

Frontend route guards are used only for user experience and must not be considered security controls.

## Project Access Control

Project access is controlled through project membership and role permissions.

Users can only access projects and resources they are authorized to view.

## Administrative Controls

Administrative capabilities include:

- User management
- Role assignment
- Audit log access
- Platform administration

Administrative endpoints require server-side authorization checks.

## Secrets Management

All secrets are supplied through environment variables.

The following files must never be committed:

- .env
- private TLS keys
- database dumps
- generated source archives

Production startup is blocked when unsafe default secrets are detected.

## Transport Security

Nginx terminates TLS connections.

A self-signed certificate can be used for local deployments.

Replace local certificates before exposing VeriOps to external users.

Private keys must never be committed to source control.

## AI Runtime

VeriOps supports local AI inference through an OpenAI-compatible endpoint.

The default deployment uses llama.cpp with locally hosted models.

No external AI provider is required.

## Audit Logging

Security-relevant actions are written to audit logs.

Examples include:

- User management activity
- Project changes
- Test execution activity
- Defect lifecycle activity

## Security Recommendations

- Use strong secrets.
- Replace self-signed certificates in production.
- Keep backups encrypted.
- Restrict administrator access.
- Regularly rotate credentials.

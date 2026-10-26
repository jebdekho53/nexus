# Seller key visibility — deployed 22 October 2026

Matrix control plane is deployed to the new Ubuntu server at 103.109.183.247, served by systemd (matrix.service) and Caddy HTTPS (caddy.service) at https://matrix.vaidya-gpt.com.

- Full keys are available to authenticated owner sellers/admin management. Encryption and tenant filtering are preserved.
- 15 server tests passed on Ubuntu. HTTPS admin login, seller page and deployed UI assets verified. Source hashes matched.
- Fresh database at /srv/matrix-data. Previous expired server registry was not available and has not been migrated. Legacy hash-only keys cannot be reconstructed; capture occurs on valid activation/verification when a legacy registry is imported.
- Administrator credential file copied locally to ignored diagnostics/matrix-new-server-admin-access.txt. Credentials are not in this report.
- Desktop installers 1.0.15 and 1.0.16 have NOT been uploaded. The public downloads directory contains no installer.

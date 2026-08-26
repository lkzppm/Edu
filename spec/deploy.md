# Deploy — homelab

Edu runs 24/7 on the homelab laptop next to Fin, reachable from anywhere over Tailscale only. Nothing is exposed to the public internet or the LAN. Decided 2026-08-26.

## Topology

```
phone / notebook ──(WireGuard, Tailscale)──▶ laptop
                                              tailscale serve :8443 (TLS)
                                                └▶ 127.0.0.1:3001  web (Next.js)
                                                      └▶ api ──▶ db   (compose network only)
```

- URL: `https://<laptop>.<tailnet>.ts.net:8443` (Fin owns `:443`; Edu takes `:8443`).
- The browser talks only to `web`; all `/api/*` calls are proxied server-side by the Next.js catch-all route. The FastAPI port is never published in deploy.
- `docker-compose.deploy.yml` overrides ports: web on loopback only, api unpublished.

## Security model

Threat model: single user (Lucas); the goal is zero public attack surface, not multi-user auth.

- **No open ports**: no router port-forwarding, firewall denies all inbound except the Tailscale interface, app ports bound to `127.0.0.1`. Internet scanners see nothing.
- **Only way in**: the WireGuard tunnel. Peers must be devices enrolled in Lucas's tailnet — identity is the Tailscale login (Google account) plus a per-device key. That login MUST have 2FA/passkey.
- **Encryption**: end-to-end WireGuard; `tailscale serve` adds real TLS certs for the `ts.net` name. Tailscale's coordination server only exchanges public keys — it cannot read traffic.
- **Residual risks** (accepted): compromise of the Tailscale login account (mitigated by 2FA), a stolen unlocked enrolled device (revoke it in the Tailscale admin console), physical access to the laptop (optional: full-disk encryption at OS install).
- Apps stay auth-less by design — the network is the auth layer. If Edu is ever exposed beyond the tailnet, that decision must be revisited here first.

## Laptop setup (one-time)

1. Debian/Ubuntu Server minimal. During install: enable disk encryption if desired, install OpenSSH.
2. Laptop-as-server: in `/etc/systemd/logind.conf` set `HandleLidSwitch=ignore` and `HandleLidSwitchExternalPower=ignore`; in BIOS enable restore-on-power. The battery doubles as a UPS.
3. Install Docker Engine + compose plugin; add user to `docker` group.
4. Install Tailscale, `tailscale up`, then `tailscale set --auto-update`. In the admin console enable MagicDNS + HTTPS certs.
5. Firewall: `ufw default deny incoming`, `ufw allow in on tailscale0`, `ufw enable`. SSH thereafter only over the tailnet.
6. Enable `unattended-upgrades` for OS security patches.
7. Clone the repo, copy `.env` (never committed; transfer over the tailnet, e.g. `tailscale file cp` or scp).

## Run / update

```sh
docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d --build
tailscale serve --bg --https=8443 3001   # once; persists across reboots
```

Update = `git pull` + the same `up -d --build`. All services have `restart: unless-stopped`, so reboots recover on their own.

## Backups

Nightly host cron: `docker compose exec -T db pg_dump -U edu edu | gzip` to a dated file; keep 14 days; sync the backup dir off-machine (any synced folder or a second tailnet device). Task status lives only in this DB (rule 6), so the dump is the only copy — verify a restore once after first setup.

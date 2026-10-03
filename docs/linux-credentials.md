# Linux credential storage

macOS continues to use Keychain. Linux uses Google Secret Manager through an
installed and authenticated `gcloud` command. Set public configuration only:

```sh
export UTSUKUBA_SECRET_PROJECT=your-project-id
export UTSUKUBA_SECRET_PREFIX=utsukuba
# Optional: pin a runtime account rather than gcloud's active human account.
export UTSUKUBA_SECRET_ACCOUNT=runtime@your-project-id.iam.gserviceaccount.com
```

For profile `school`, provision the secret `utsukuba-school-credentials` and seed
`{"format":"kai-credential-v1","value":null}`. Grant the runtime account only
`roles/secretmanager.secretAccessor` and `roles/secretmanager.secretVersionAdder`
on that secret. Then use the ordinary interactive login command:

```sh
utsukuba --profile school login
```

Password prompts require a terminal. Enter passwords at the masked prompt, not
in command arguments. Secret reads stay in memory, and writes use stdin rather
than temporary files. Access failures never become an absent credential.
The envelope's non-null `value` is a JSON string with `username` and `password`.
No new version is written when a session refresh uses unchanged credentials.
Logout appends a null marker; old versions still exist and need administrator
cleanup when necessary. This does not revoke the university password.

Manaba and TWINS share the credential secret for a profile, matching Keychain's
existing profile-level storage. Use different profiles for separate credentials.
Session cookies remain local to `UTSUKUBA_CLI_HOME` (default `~/.utsukuba-cli`),
with files mode 0600 and newly created directories mode 0700. Keep this directory
outside Git and Nix inputs. To restore a session on another machine, log in again.

The committed `bun.lock` fixes dependencies. Install using
`bun install --frozen-lockfile`, and run `bun test --workspaces` plus
`bun run --filter '*' typecheck` to check a change.

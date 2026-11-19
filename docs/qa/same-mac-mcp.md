# Same-Mac MCP verification

The user-facing [registration instructions](../mcp.md) apply to the Mac build containing the helper. A human first-use trial starts when a first-time user opens their client’s instructions and ends when the chat answers the shared request. The target is five minutes for each of seven clients. The owner approved publishing the PR before these trials. No human times have been recorded.

## Client checks

The signed candidate advertises 99 tools, including separate operations to read and update the dashboard appearance. Command timings below cover the stated automated check only.

| Local client             | Evidence on the test Mac                                                                                                                              | First-use time |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Claude Code 2.1.328      | An isolated user-scoped registration reported Connected from another project (0.35 s).                                                                | Unmeasured     |
| Codex 0.170.0            | Registered command was enabled for stdio. App Server discovered all 99 tools from a second project. An earlier 97-tool discovery completed in 0.46 s. | Unmeasured     |
| Muse                     | User-scoped JSON documented. Client absent from this Mac.                                                                                             | Unmeasured     |
| Devin CLI 3000.13.4      | Isolated user registration and lookup from another project succeeded (0.21 s).                                                                        | Unmeasured     |
| Cursor 3.31.10           | Local app present. User-scoped JSON documented. Interactive chat awaits a client trial.                                                               | Unmeasured     |
| GitHub Copilot CLI       | User-scoped command documented. CLI absent from this Mac.                                                                                             | Unmeasured     |
| Gemini (Antigravity CLI) | User-level JSON documented. CLI absent from this Mac.                                                                                                 | Unmeasured     |

## Product checks

- The arm64 Developer ID–signed QA application discovered tools using its bundled launcher. A workspace on disk retained the draft, unfinished task, completion and original operation receipt across separate stdio sessions. Repeating an acknowledged UUID preserved the original row. A replacement build at the same path retained the registration and saved data. Both Intel and arm64 application bundles, DMGs and restored ZIP contents were inspected. Local QA signing omitted the remote timestamp and notarization. The PR includes a separate native Intel package check. The ordinary installed CoreLive app, user account, client settings and host desktop were outside these fixtures.
- Two independent stdio sessions exercised the ordinary app dispatcher, real macOS peer checks and on-disk worker. After reading Work, selecting Personal, adding to Work, stopping the owner and reconnecting, Work held one new row and the restarted owner returned the original receipt. The local-only completion was present once. Other-account, expired and legacy receipts were tested separately.
- A disposable PostgreSQL instance served 36,500 completion rows through the same finite HTTP/oRPC transport as the account reader. One run transferred 10,736,890 bytes in 193 ms with a peak process RSS of 352,026,624 bytes. The process included the client, server and fixture. A terminal count and verified identities determine whether the account is included. Incomplete reads use device history. Before distributing the Mac app, deploy the endpoint to Vercel and verify the transfer there with an isolated test account.
- Matching dashboard inputs produced identical PNG bytes across the renderer move (960 × 1200 pixels, 62,838 bytes). An isolated Electron 45.3.3 renderer saved a valid file with zero native windows. Two writers targeting the same name produced one file and one collision. The headless browser downloaded the image from the dashboard. The production Next server returned HTTP 404 for all three retired paths with no Location header.
- Account Appearance uses an authenticated setting. Browser tests exercise importing the first local choice, reading the result from a fresh browser context, observing an external change on refresh and switching accounts. The database tests exercise account isolation and concurrent initialization.

Run the product suites with `pnpm validate` and `pnpm test:db` against an isolated database. The [headless development guide](../headless-development.md) includes the renderer and activity-card fixtures. Run `pnpm --filter @corelive/desktop qa:mcp-package /absolute/path/to/CoreLive.app` against a packaged Mac candidate.

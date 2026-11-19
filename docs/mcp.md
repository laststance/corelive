# Use CoreLive from an AI agent on your Mac

You need an Apple Silicon Mac with macOS 13 or later. Download `CoreLive-<version>-arm64.dmg` from [CoreLive releases](https://github.com/laststance/corelive/releases) and drag `CoreLive.app` into Applications. Keep it there so the registered command stays valid after app updates. If you install it elsewhere, use the actual app bundle path in the commands below. These steps register CoreLive once per agent and apply across projects.

Drafts and device history work offline. A connected account adds dashboard data, skills and activity-card export. CoreLive starts in the background on the first data call. Your agent manages tool approvals. A chat that runs entirely on a remote computer cannot reach this Mac’s device workspace.

Choose your agent below. Each guide ends with the same request. Replace only **Send the invoice** with the title you want. In the answer, look for a summary of the note, the category where the unfinished task was saved, and today's completions with their source. An empty history is a valid result. Reading a category and then adding to it keeps the original destination even if you select another category in LiveEditor.

## Claude Code

In Terminal, from any directory, run the following command to register CoreLive for your user account. Start a local Claude Code chat. Use `/mcp` to check that `corelive` is connected. [Claude Code MCP](https://code.claude.com/docs/en/mcp)

```sh
claude mcp add --scope user --transport stdio corelive -- "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp"
```

Paste this request into the agent chat.

> Read my current note, add “Send the invoice” as a task, and tell me what I finished today.

## Codex

In Terminal, run the following command from any directory, then start a new local Codex chat. Run `codex mcp get corelive` in Terminal to inspect the saved command. [Codex MCP](https://developers.openai.com/codex/mcp/)

```sh
codex mcp add corelive -- "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp"
```

Paste this request into the agent chat.

> Read my current note, add “Send the invoice” as a task, and tell me what I finished today.

## Muse

In the user settings file `~/.config/muse/settings.json` (or `$XDG_CONFIG_HOME/muse/settings.json`), add the `corelive` entry under `mcpServers`. Keep your existing entries. A new settings file needs `schema_version`. Start a new Muse session and check `/mcp`. [Muse MCP](https://meta-models.github.io/muse-code-sdk/next/guides/extend/mcp-servers/)

```json
{
  "schema_version": 1,
  "mcpServers": {
    "corelive": {
      "command": "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp",
      "args": []
    }
  }
}
```

Paste this request into the agent chat.

> Read my current note, add “Send the invoice” as a task, and tell me what I finished today.

## Devin CLI

Run this in Terminal from any directory, then start a local Devin CLI session on the same Mac. The user scope applies across projects. [Devin CLI MCP](https://docs.devin.ai/cli/extensibility/mcp/configuration)

```sh
devin mcp add -s user corelive -- "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp"
```

Paste this request into the agent chat.

> Read my current note, add “Send the invoice” as a task, and tell me what I finished today.

## Cursor

Add this server to `~/.cursor/mcp.json` on the Mac. Merge the `corelive` entry into your existing `mcpServers` object. Open Cursor Settings, find MCP and confirm CoreLive is enabled, then use a local Agent chat. [Cursor MCP](https://cursor.com/docs/mcp)

```json
{
  "mcpServers": {
    "corelive": {
      "command": "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp",
      "args": []
    }
  }
}
```

Paste this request into the agent chat.

> Read my current note, add “Send the invoice” as a task, and tell me what I finished today.

## GitHub Copilot CLI

Run this in Terminal, then open a local Copilot CLI chat. The command writes a user-level entry in `~/.copilot/mcp-config.json`. Use `/mcp` to check the server. [GitHub Copilot CLI MCP](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)

```sh
copilot mcp add corelive -- "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp"
```

Paste this request into the agent chat.

> Read my current note, add “Send the invoice” as a task, and tell me what I finished today.

## Gemini (Antigravity CLI)

For Google's local Antigravity CLI, add `corelive` to `mcpServers` in `~/.gemini/config/mcp_config.json`. Preserve other servers in that file. Start a new local session and check the available MCP tools. [Antigravity MCP](https://antigravity.google/docs/mcp?tab=cli)

```json
{
  "mcpServers": {
    "corelive": {
      "command": "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp",
      "args": []
    }
  }
}
```

Paste this request into the agent chat.

> Read my current note, add “Send the invoice” as a task, and tell me what I finished today.

## Everyday requests

- “Show the draft in Work / CoreLive, then add ‘Check the invoice’ to that category.”
- “Create a category called Planning under Work.”
- “Export my workspace to corelive-backup.json.” `save_workspace_backup` writes a JSON copy for inspection and manual recovery and returns its path, even when the inline export reports `result-too-large`. To restore CoreLive on a Mac, back up the entire `offline/` directory, including the device registry and checksummed workspace files. [Back up or move CoreLive to a new Mac](./offline-liveeditor.md#backup-and-moving-to-a-new-mac)
- “Set my dashboard appearance to Harbor dark.” This changes the connected account. Other browsers load the saved theme when you open or refocus the dashboard. LiveEditor keeps its own appearance.
- To connect this Mac or choose Not now, read the pending account with `read_account_status`. After confirming the account, pass its `pendingConnect.promptId` to `connect_account` or `defer_account_connection`. If the prompt has changed, read the account status again before acting.
- “Show this week's completed tasks in Work, including tasks from child categories.”
- “Save today's activity card as activity.png.” Choose a day with completed activity on the connected Dashboard. A filename alone goes under the active profile's `Exports`. A standard installation uses `~/Library/Application Support/CoreLive/Exports`. You can also give an absolute path. The answer includes the actual path after saving. An occupied filename requires an explicit overwrite instruction.

### Read and edit a long note

When `read_draft` reports `result-too-large`, copy the error’s `categoryId` and `revision` into the retry at offset zero. This keeps the read on the original note even if the selected category changes. For example, for revision 0, call `read_draft` with these arguments.

```json
{
  "categoryId": "10000000-0000-4000-8000-000000000001",
  "textPage": { "offset": 0, "expectedRevision": 0 }
}
```

For each subsequent page, keep the same `categoryId` and `textPage.expectedRevision`. Pass the last page’s `nextOffset` as `textPage.offset`. If the next offset is 2, call `read_draft` again with the following arguments.

```json
{
  "categoryId": "10000000-0000-4000-8000-000000000001",
  "textPage": { "offset": 2, "expectedRevision": 0 }
}
```

Join the pages' text in order. Each distinct `rowSpans` ID represents one row, even if it spans several pages. Its `startOffset` and `endOffset` count UTF-16 units in the joined text and exclude the separating newline. Preserve the row ID and any completion ID. Send all reconstructed rows to `edit_draft`, using the first page’s revision as `baseRevision`. For a one-row note, the edited request could look like this.

```json
{
  "categoryId": "10000000-0000-4000-8000-000000000001",
  "baseRevision": 0,
  "rows": [
    { "id": "20000000-0000-4000-8000-000000000001", "text": "Send the invoice" }
  ]
}
```

If the revision changes, read the same `categoryId` again from offset zero. Omit `expectedRevision` on this first page to get the new revision, then use it for the remaining pages and the edit.

## If a request fails

| Result                                | What to do                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The client cannot start CoreLive      | Check that the registered executable exists inside the installed app. If you moved the app, correct the command and reconnect.                                           |
| The app is still starting             | Open CoreLive and retry a call that reported no effect.                                                                                                                  |
| `category-unavailable`                | List categories and choose the intended destination.                                                                                                                     |
| `revision-conflict` or `flush-failed` | Finish editing, read the current draft and keep any intervening changes.                                                                                                 |
| `result-unknown` after adding a task  | Have the agent look up the original operation UUID with `get_task_addition_result`. If the lookup is inconclusive, report the unknown result and leave the draft intact. |
| History says `device`                 | The answer covers this Mac. For `not-connected`, connect the account. For `account-unavailable`, retry when the account is reachable. Start a fresh history request.     |
| `file-exists`                         | The existing file was preserved. Choose a different filename or explicitly request replacement.                                                                          |

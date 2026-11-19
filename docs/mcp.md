# Use CoreLive from an AI agent on your Mac

Install the CoreLive Mac app that includes the MCP helper. Keep it in Applications so its registered command stays valid after app updates. If you install it elsewhere, substitute the actual app bundle location in the instructions below. These steps register CoreLive once per agent and apply across projects.

Drafts and device history work offline. A connected account adds dashboard data, skills and activity-card export. CoreLive starts in the background on the first data call. Your agent manages tool approvals. A chat that runs entirely on a remote computer cannot reach this Mac’s device workspace.

Choose your agent below. Each guide ends with the same request. Replace only **請求書を送る** with the title you want. In the answer, look for a summary of the note, the category where the unfinished task was saved, and today's completions with their source. An empty history is a valid result. Reading a category and then adding to it keeps the original destination even if you select another category in LiveEditor.

## Claude Code

In Terminal, from any directory, run the following command to register CoreLive for your user account. Start a local Claude Code chat. Use `/mcp` to check that `corelive` is connected. [Claude Code MCP](https://code.claude.com/docs/en/mcp)

```sh
claude mcp add --scope user --transport stdio corelive -- "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp"
```

Paste this request into the agent chat.

> 今のメモを読んで、「請求書を送る」をタスクに追加して。今日終えたことも教えて。

## Codex

In Terminal, run the following command from any directory, then start a new local Codex chat. Run `codex mcp get corelive` in Terminal to inspect the saved command. [Codex MCP](https://developers.openai.com/codex/mcp/)

```sh
codex mcp add corelive -- "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp"
```

Paste this request into the agent chat.

> 今のメモを読んで、「請求書を送る」をタスクに追加して。今日終えたことも教えて。

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

> 今のメモを読んで、「請求書を送る」をタスクに追加して。今日終えたことも教えて。

## Devin CLI

Run this in Terminal from any directory, then start a local Devin CLI session on the same Mac. The user scope applies across projects. [Devin CLI MCP](https://docs.devin.ai/cli/extensibility/mcp/configuration)

```sh
devin mcp add -s user corelive -- "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp"
```

Paste this request into the agent chat.

> 今のメモを読んで、「請求書を送る」をタスクに追加して。今日終えたことも教えて。

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

> 今のメモを読んで、「請求書を送る」をタスクに追加して。今日終えたことも教えて。

## GitHub Copilot CLI

Run this in Terminal, then open a local Copilot CLI chat. The command writes a user-level entry in `~/.copilot/mcp-config.json`. Use `/mcp` to check the server. [GitHub Copilot CLI MCP](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)

```sh
copilot mcp add corelive -- "/Applications/CoreLive.app/Contents/Helpers/corelive-mcp"
```

Paste this request into the agent chat.

> 今のメモを読んで、「請求書を送る」をタスクに追加して。今日終えたことも教えて。

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

> 今のメモを読んで、「請求書を送る」をタスクに追加して。今日終えたことも教えて。

## Everyday requests

- “Show the draft in Work / CoreLive, then add ‘Check the invoice’ to that category.”
- A long note can be read in parts. When `read_draft` reports `result-too-large`, request `textPage` with offset zero. Carry the returned category ID, revision and next offset into each later call. A changed revision asks the agent to start again.
- “Create a category called Planning under Work.”
- “Save a complete backup of my workspace to corelive-backup.json.” The app returns the saved file's path. Use `save_workspace_backup` when an inline export reports `result-too-large`.
- “Set my dashboard appearance to Harbor dark.” This changes the connected account. Other browsers load the saved theme when you open or refocus the dashboard. LiveEditor keeps its own appearance.
- “Show this week's completed tasks in Work, including tasks from child categories.”
- “Save today's activity card as activity.png.” Choose a day with completed activity on the connected Dashboard. A filename alone goes under the active profile's `Exports`. A standard installation uses `~/Library/Application Support/CoreLive/Exports`. You can also give an absolute path. The answer includes the actual path after saving. An occupied filename requires an explicit overwrite instruction.

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

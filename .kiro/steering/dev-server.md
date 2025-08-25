---
inclusion: always
---

# Dev Server Launch Rules

Use tmux sessions for development servers to avoid blocking the main process.

### Target Servers

- Next.js, Vite, Electron: `<npm|yarn|pnpm> run dev`
- Storybook: `<npm|yarn|pnpm> run storybook`
- Electron: `<npm|yarn|pnpm> run start`

### Steps

1. **Create tmux session** with dedicated name
2. **Send command** to the session
3. **Background execution** - server runs without blocking terminal

#### Next.js, Vite

```bash
tmux new -s next-dev-server -d
tmux send-keys -t next-dev-server "export PATH="$HOME/.volta/bin:$PATH" && cd (pwd) && <npm|yarn|pnpm> run dev" Enter
```

#### Storybook

```bash
tmux new -s storybook-dev-server -d
tmux send-keys -t storybook-dev-server "export PATH="$HOME/.volta/bin:$PATH" && cd (pwd) && <npm|yarn|pnpm> run storybook" Enter
```

### Session Management

- Check sessions: `tmux list-sessions`
- Attach to session: `tmux attach -t <session-name>`
- Kill session: `tmux kill-session -t <session-name>`

### Notes

- Check for existing instances if port is in use
- Kill all tmux sessions when finished to clean up background processes

# Rules for Creating New Issues

- If no issues & PRs exist: After reading PRD.md and documents in the docs folder, review whether there are any incomplete requirements in the current codebase and whether it is implemented with the correct tech stack.
- Register all issues found in the review as Issues with an overview and a task list with checkboxes.

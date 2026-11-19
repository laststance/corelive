// Start only CoreLive's bundled stdio entry, even when the agent's working directory or PATH changes.
#include <limits.h>
#include <mach-o/dyld.h>
#include <pwd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  const char profile_flag[] = "--user-data-dir=";
  if (argc > 2 || (argc == 2 && (strncmp(argv[1], profile_flag, sizeof(profile_flag) - 1) != 0 ||
                                 argv[1][sizeof(profile_flag) - 1] != '/'))) {
    fputs("Usage: corelive-mcp [--user-data-dir=/absolute/profile]\n", stderr);
    return 64;
  }

  char original[PATH_MAX], contents[PATH_MAX], electron[PATH_MAX], entry[PATH_MAX];
  uint32_t size = sizeof(original);
  if (_NSGetExecutablePath(original, &size) != 0 || !realpath(original, contents)) return 1;
  // This signed binary lives at Contents/Helpers/corelive-mcp. Resolve every executable from itself.
  for (int i = 0; i < 2; ++i) {
    char *slash = strrchr(contents, '/');
    if (!slash) return 1;
    *slash = '\0';
  }
  if (snprintf(electron, sizeof(electron), "%s/MacOS/CoreLive", contents) >= (int)sizeof(electron) ||
      snprintf(entry, sizeof(entry), "%s/Resources/mcp/stdio.cjs", contents) >= (int)sizeof(entry))
    return 1;
  struct passwd *user = getpwuid(geteuid());
  char home[PATH_MAX + 6];
  if (!user || snprintf(home, sizeof(home), "HOME=%s", user->pw_dir) >= (int)sizeof(home)) return 1;
  // In particular, an agent's NODE_OPTIONS, NODE_PATH or Electron switches cannot replace the entry.
  char *env[] = {home, "PATH=/usr/bin:/bin", "ELECTRON_RUN_AS_NODE=1", NULL};
  char *args[] = {electron, entry, argc == 2 ? argv[1] : NULL, NULL};
  execve(electron, args, env);
  perror("CoreLive MCP launcher");
  return 1;
}

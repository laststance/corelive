/**
 * Where a visitor downloads the CoreLive Mac app.
 *
 * Web deployments can precede a desktop release, so this points at the GitHub
 * releases page, which always lists the published installers (both
 * architectures). Used by {@link AppSidebar} and the Home empty state in
 * {@link CompletedTodos}.
 */
export const MAC_DOWNLOAD_URL =
  'https://github.com/laststance/corelive/releases/latest'

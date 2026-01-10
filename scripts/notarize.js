import { notarize } from '@electron/notarize'
import 'dotenv/config'

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context

  if (electronPlatformName !== 'darwin') {
    return
  }

  const appName = context.packager.appInfo.productFilename

  // Check if we have the required environment variables
  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_ID_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(
      'Skipping notarization: Missing required environment variables (APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID)',
    )
    return
  }

  try {
    await notarize({
      appBundleId: 'com.corelive.app',
      appPath: `${appOutDir}/${appName}.app`,
      appleId: appleId,
      appleIdPassword: appleIdPassword,
      teamId: teamId,
    })
  } catch (error) {
    console.error('Notarization failed:', error)
    throw error
  }
}

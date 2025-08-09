import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Issue mock Clerk-like cookies for localhost and redirect to /home
  const redirectUrl = new URL('/home', req.url)

  const response = NextResponse.redirect(redirectUrl)

  // Create a minimally valid JWT-like token using base64url parts
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' })
  ).toString('base64url')
  const nowSec = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'clerk.local',
      sub: 'user_mock_123',
      sid: 'sess_mock_123',
      iat: nowSec,
      exp: nowSec + 60 * 60 * 24,
    })
  ).toString('base64url')
  const token = `${header}.${payload}.mock_signature`

  // Set cookies Clerk expects. Values are syntactically valid so Clerk doesn't throw on decode
  response.cookies.set('__session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  })
  response.cookies.set('__clerk_db_jwt', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  })
  response.cookies.set('clerk-session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  })

  // Lightweight flag cookie for our custom bypass too
  response.cookies.set('mock_auth', 'true', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  })

  return response
}



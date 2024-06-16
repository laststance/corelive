export async function POST(_req: Request) {
  // Your logic here

  return new Response(JSON.stringify({ message: 'Saved ✅' }), { status: 200 })
}

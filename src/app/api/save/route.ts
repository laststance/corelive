/* eslint-disable @typescript-eslint/no-unused-vars */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
// TODO
export async function POST(req: Request) {
  const { editorList, completed } = await req.json()

  // Start a transaction to ensure data consistency
  // const result = await prisma.$transaction(async (prisma) => {
  //   // Create an entry in the 'Editor' table
  //   const editor = await prisma.editor.create({
  //     data: {
  //       text: editorList,
  //       // Assuming 'completed' is a relation to another table
  //       completed: {
  //         create: completed.map(item => ({ title: item })),
  //       },
  //     },
  //   })
  //   return editor
  // })

  return new Response(JSON.stringify({ message: 'Saved ✅' }), { status: 200 })
}

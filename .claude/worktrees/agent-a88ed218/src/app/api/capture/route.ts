import { createClient } from '@/shared/api/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { type, title, details } = body

    if (!type || !title) {
      return NextResponse.json(
        { error: 'Type and title are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    let result

    switch (type) {
      case 'Task':
        result = await supabase
          .from('tasks')
          .insert({
            title,
            notes: details || null,
            status: 'open',
          })
        break

      case 'Note':
        result = await supabase
          .from('knowledge_snippets')
          .insert({
            title,
            body: details || null,
          })
        break

      case 'Project':
        result = await supabase
          .from('projects')
          .insert({
            title,
            description: details || null,
          })
        break

      default:
        return NextResponse.json(
          { error: 'Invalid type. Must be Task, Note, or Project' },
          { status: 400 }
        )
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}


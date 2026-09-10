import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | undefined

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.https://mikluswidmvjlhpinuhy.supabase.co || 'http://localhost:54321',
      process.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pa2x1c3dpZG12amxocGludWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMzg5NTUsImV4cCI6MjEwNDYxNDk1NX0.kQCiDcU3KUumaHkzZr9lHZXDCYJZCVp4BdM8wtO0-Ls || 'placeholder-anon-key',
    )
  }
  return browserClient
}

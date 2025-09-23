import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { processVrboImage } from '@/lib/vrbo-image-processor'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read the CSV content
    const csvContent = await file.text()
    const lines = csvContent.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have at least a header and one data row' }, { status: 400 })
    }

    // Parse CSV header
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

    // Expected columns mapping
    const columnMapping = {
      'Title': 'title',
      'Main Image URL': 'main_image_url',
      'City': 'city',
      'Bedrooms': 'bedrooms',
      'Bathrooms': 'bathrooms',
      'Sleeps': 'sleeps',
      'Link': 'link',
      'Non-Tracked Link': 'non_tracked_link',
      'Local/Greater': 'listing_type',
      'Adjusted Main Image URL': 'adjusted_image_url'
    }

    // Find column indices
    const columnIndices: { [key: string]: number } = {}
    for (const [csvHeader, dbField] of Object.entries(columnMapping)) {
      const index = headers.findIndex(h => h === csvHeader)
      if (index !== -1) {
        columnIndices[dbField] = index
      }
    }

    // Validate required columns
    const requiredFields = ['title', 'link', 'listing_type']
    const missingFields = requiredFields.filter(field => !(field in columnIndices))
    if (missingFields.length > 0) {
      return NextResponse.json({
        error: `Missing required columns: ${missingFields.map(f =>
          Object.keys(columnMapping).find(k => columnMapping[k as keyof typeof columnMapping] === f)
        ).join(', ')}`
      }, { status: 400 })
    }

    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
      imagesProcessed: 0,
      imagesFailed: 0
    }

    // Process each data row
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i])
        if (values.length === 0) continue // Skip empty lines

        // Extract data from CSV row
        const rowData: any = {}
        for (const [dbField, index] of Object.entries(columnIndices)) {
          const value = values[index]?.trim().replace(/"/g, '') || null

          if (value) {
            switch (dbField) {
              case 'bedrooms':
              case 'sleeps':
                rowData[dbField] = parseInt(value) || null
                break
              case 'bathrooms':
                rowData[dbField] = parseFloat(value) || null
                break
              case 'listing_type':
                if (['Local', 'Greater'].includes(value)) {
                  rowData[dbField] = value
                } else {
                  throw new Error(`Invalid listing type: ${value}. Must be "Local" or "Greater"`)
                }
                break
              default:
                rowData[dbField] = value
            }
          }
        }

        // Validate required fields
        if (!rowData.title || !rowData.link || !rowData.listing_type) {
          results.errors.push(`Row ${i + 1}: Missing required fields`)
          continue
        }

        // Check if listing already exists (by link)
        const { data: existing } = await supabaseAdmin
          .from('vrbo_listings')
          .select('id')
          .eq('link', rowData.link)
          .single()

        if (existing) {
          results.skipped++
          continue
        }

        // Process image if provided
        let adjusted_image_url = rowData.adjusted_image_url || null
        if (rowData.main_image_url && !adjusted_image_url) {
          console.log(`Processing VRBO image for CSV listing: ${rowData.title}`)
          try {
            const imageResult = await processVrboImage(rowData.main_image_url, rowData.title)
            if (imageResult.success && imageResult.adjusted_image_url) {
              adjusted_image_url = imageResult.adjusted_image_url
              console.log('Image processed successfully:', adjusted_image_url)
              results.imagesProcessed++
            } else {
              console.warn('Image processing failed:', imageResult.error)
              results.imagesFailed++
              // Continue with creation - image processing failure shouldn't block listing creation
            }
          } catch (imageError) {
            console.error('Image processing error:', imageError)
            results.imagesFailed++
            // Continue with creation - image processing failure shouldn't block listing creation
          }
        }

        // Insert new listing
        const { error: insertError } = await supabaseAdmin
          .from('vrbo_listings')
          .insert([{
            ...rowData,
            adjusted_image_url,
            is_active: true
          }])

        if (insertError) {
          results.errors.push(`Row ${i + 1}: ${insertError.message}`)
        } else {
          results.created++
        }

      } catch (error) {
        results.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      message: 'CSV upload completed',
      results
    })

  } catch (error) {
    console.error('CSV upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to parse CSV line with proper comma handling
function parseCSVLine(line: string): string[] {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}
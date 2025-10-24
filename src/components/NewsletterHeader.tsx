'use client'

import Link from 'next/link'

interface NewsletterHeaderProps {
  currentPage?: 'events' | 'archive'
}

export default function NewsletterHeader({ currentPage }: NewsletterHeaderProps) {
  return (
    <>
      {/* Logo Header */}
      <div className="bg-blue-600 py-3">
        <div className="max-w-6xl mx-auto px-4">
          <img
            src="https://raw.githubusercontent.com/VFDavid/STCScoop/refs/heads/main/STCSCOOP_Logo_824X148_clear.png"
            alt="St. Cloud Scoop"
            className="h-16 md:h-24 w-auto mx-auto"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex gap-6">
            <Link
              href="/events/view"
              className={`font-medium transition-colors ${
                currentPage === 'events'
                  ? 'text-blue-600 border-b-2 border-blue-600 pb-3 -mb-3'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              Events
            </Link>
            <Link
              href="/newsletter"
              className={`font-medium transition-colors ${
                currentPage === 'archive'
                  ? 'text-blue-600 border-b-2 border-blue-600 pb-3 -mb-3'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              Newsletter Archive
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

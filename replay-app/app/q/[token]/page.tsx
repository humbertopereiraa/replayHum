'use client'

import { useParams } from 'next/navigation'
import { ReplayApp } from '../../page'

export default function AcessoPorQr() {
  const params = useParams<{ token: string }>()
  const token = typeof params.token === 'string' ? params.token : ''
  if (!token) return null
  return <ReplayApp qrToken={token} />
}

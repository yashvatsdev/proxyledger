'use client'

import { useState } from 'react'
import Image from 'next/image'
import { userInitials, type UserProfile } from '@/lib/auth-utils'

export default function UserAvatar({ user }: { user: UserProfile }) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  return <div className="avatar avatar-small user-avatar" role="img" aria-label={user.name || 'Your profile'}>
    {user.image && failedImage !== user.image ? <Image src={user.image} alt="" width={30} height={30} unoptimized referrerPolicy="no-referrer" onError={() => setFailedImage(user.image)} /> : userInitials(user)}
  </div>
}

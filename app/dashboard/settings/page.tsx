import Link from 'next/link'
import { requireUser } from '@/lib/auth-session'
import UserAvatar from '@/components/user-avatar'
import SignOutButton from '@/components/sign-out-button'

export default async function SettingsPage() {
  const user = await requireUser()
  const profile = { name: user.name ?? null, email: user.email ?? null, image: user.image ?? null }
  return <div className="page-content circle-page"><div className="hero-row"><div><div className="eyebrow">YOUR ACCOUNT</div><h1>Settings</h1><p>Your account and notification information.</p></div></div>
    <section className="panel account-panel"><div className="circle-card-header"><UserAvatar user={profile} /><div><h2>Google account</h2><p>Your profile is provided by Google when you sign in.</p></div></div><dl className="favor-detail-grid"><div><dt>Display name</dt><dd>{profile.name || 'Not provided'}</dd></div><div><dt>Email address</dt><dd>{profile.email || 'Not provided'}</dd></div><div><dt>Sign-in method</dt><dd>Google</dd></div></dl><p className="circle-muted">Profile editing is managed through your Google account. Proxy Ledger has no separate password.</p><SignOutButton /></section>
    <section className="panel account-panel"><h2>Notifications</h2><p className="circle-muted">Friend invitations, favor updates and settlement requests appear in your notification inbox. Updates refresh when you return to the app and every 30 seconds while it is visible; refresh pauses while a dialog is open.</p><Link className="button outline" href="/dashboard/notifications">View notifications</Link></section>
  </div>
}

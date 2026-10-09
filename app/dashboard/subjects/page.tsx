import Link from 'next/link'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createFavorsService } from '@/lib/favors-service'
import SubjectForm from './subject-form'

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const page = Math.min(1000, Math.max(1, Number(params.page) || 1))
  const result = await createFavorsService(getPrisma()).subjects(user.id, { page: Math.floor(page) })
  return <div className="page-content"><div className="hero-row"><div><div className="eyebrow">YOUR SUBJECTS</div><h1>Subjects</h1><p>Organize your attendance favors. Every confirmed favor counts globally.</p></div></div><SubjectForm /><p className="circle-muted">{result.count} subjects · Names stay fixed to preserve favor history.</p><section className="circle-grid">{result.rows.map(subject => <article className="panel favor-card" key={subject.id}><h2>{subject.name}</h2><p className="circle-muted">{subject._count.favors} recorded favors</p><Link className="text-button" href={`/dashboard/transactions?subject=${subject.id}`}>View transactions →</Link></article>)}</section>{!result.rows.length && <div className="panel circle-empty"><h2>Make room for your first subject</h2><p>Create a subject above, then select it when recording a favor.</p></div>}<nav className="circle-pagination" aria-label="Subject pages">{page > 1 && <Link className="button outline" href={`/dashboard/subjects?page=${page - 1}`}>Previous</Link>}{result.count > page * 20 && <Link className="button outline" href={`/dashboard/subjects?page=${page + 1}`}>Next</Link>}</nav></div>
}

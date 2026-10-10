import Link from 'next/link'
import { requireUser } from '@/lib/auth-session'
import { getPrisma } from '@/lib/db'
import { createFavorsService } from '@/lib/favors-service'
import SubjectForm from './subject-form'
import { choiceInput } from '@/lib/favor-types'

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const parsed = choiceInput.safeParse({ query: params.q || '', page: Number(params.page) || 1 })
  const { page, query } = parsed.success ? parsed.data : choiceInput.parse({})
  const result = await createFavorsService(getPrisma()).subjects(user.id, { page, query })
  const href = (nextPage: number) => `/dashboard/subjects?${new URLSearchParams({ page: String(nextPage), ...(query ? { q: query } : {}) })}`
  return <div className="page-content"><div className="hero-row"><div><div className="eyebrow">YOUR SUBJECTS</div><h1>Subjects</h1><p>Organize your attendance favors. Every confirmed favor counts globally.</p></div></div><SubjectForm />{!parsed.success && <p role="alert" className="circle-feedback">Invalid filters. Showing your subjects.</p>}<form action="/dashboard/subjects" className="panel ledger-filter-form"><label>Search your subjects<input name="q" type="search" className="favor-input" maxLength={80} defaultValue={query} placeholder="Subject name" /></label><button className="button outline" type="submit">Search subjects</button>{query && <Link className="text-button" href="/dashboard/subjects">Clear search</Link>}</form><p className="circle-muted">{result.count} subjects · Names stay fixed to preserve favor history.</p><section className="circle-grid">{result.rows.map(subject => <article className="panel favor-card" key={subject.id}><h2>{subject.name}</h2><p className="circle-muted">{subject._count.favors} recorded favors</p><Link className="text-button" href={`/dashboard/transactions?subject=${subject.id}`}>View transactions →</Link></article>)}</section>{!result.rows.length && <div className="panel circle-empty"><h2>{query ? 'No matching subjects' : 'Make room for your first subject'}</h2><p>{query ? 'Try another name or clear your search.' : 'Create a subject above, then select it when recording a favor.'}</p>{query && <Link className="button outline" href="/dashboard/subjects">Show your subjects</Link>}</div>}<nav className="circle-pagination" aria-label="Subject pages">{page > 1 && <Link className="button outline" href={href(page - 1)}>Previous</Link>}{result.count > page * 20 && <Link className="button outline" href={href(page + 1)}>Next</Link>}</nav></div>
}

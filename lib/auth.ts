export const GROUP_COLORS: Record<string, string> = {
  A:'#2563EB', B:'#EF4444', C:'#F59E0B', D:'#A855F7',
  E:'#10B981', F:'#F97316', G:'#06B6D4', H:'#84CC16',
  I:'#0EA5E9', J:'#DC2626', K:'#D97706', L:'#8B5CF6',
  M:'#059669', N:'#EA580C', O:'#0891B2', P:'#65A30D',
};

export const colorFor = (L: string) => GROUP_COLORS[L] ?? '#334155';


export function requireStaff(req: Request | NextRequest) {
  const role = (req.headers.get('x-role') || '').toLowerCase()
  return role === 'admin' || role === 'coach'
}

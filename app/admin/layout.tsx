export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // The root layout already owns the centered container. Avoid nesting a
  // second container with extra padding, particularly at tablet widths.
  return (
    <div className="admin-tablet-shell min-h-screen min-w-0">
      <main className="min-w-0 pt-2 sm:pt-4 pb-6">
        {children}
      </main>
    </div>
  )
}

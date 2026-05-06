export function MainLayout() {
  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="w-64 border-r border-sidebar-border bg-sidebar p-5 text-sidebar-foreground">
        <p className="text-sm font-semibold">导航区</p>
        <p className="mt-2 text-sm text-muted-foreground">
          当前主题会同时作用于内容区和 system 组件。
        </p>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 text-2xl font-semibold">主内容区</h1>
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <p className="text-base text-card-foreground">
              这里是主内容区域，显示不同页面的内容。
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

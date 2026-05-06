export function AboutSettings() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card/80 p-4 shadow-xs sm:p-5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground sm:text-base">关于设置中心</h3>
          <p className="text-xs text-muted-foreground sm:text-sm">说明当前设置页的定位与扩展方向。</p>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
          <p>设置中心采用左侧功能导航、右侧详情面板的结构，便于逐步扩展更多桌面端能力。</p>
          <p>现在已经接入外观配置，后续可以继续补充编辑器、工作区和同步等选项。</p>
        </div>
      </section>
    </div>
  );
}

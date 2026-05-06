import { getIdentifier, getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

import packageJson from "../../../../package.json";

type AppInfo = {
  identifier: string;
  name: string;
  tauriVersion: string;
  version: string;
};

const FALLBACK_APP_INFO: AppInfo = {
  identifier: "in.ichiyo.madora",
  name: "Madora",
  tauriVersion: "-",
  version: packageJson.version,
};

// function SettingsSectionCard({
//   title,
//   description,
//   children,
// }: {
//   title: string;
//   description: string;
//   children: ReactNode;
// }) {
//   return (
//     <section className="rounded-2xl border bg-card/80 p-4 shadow-xs sm:p-5">
//       <div className="space-y-1">
//         <h3 className="text-sm font-semibold text-foreground sm:text-base">{title}</h3>
//         <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
//       </div>
//       <div className="mt-4">{children}</div>
//     </section>
//   );
// }

function AboutStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-foreground sm:text-base">{value}</div>
    </div>
  );
}

// function CapabilityCard({
//   icon: Icon,
//   title,
//   description,
// }: {
//   icon: typeof FileText;
//   title: string;
//   description: string;
// }) {
//   return (
//     <div className="rounded-xl border border-border/70 bg-background/70 p-4">
//       <div className="flex items-center gap-3 text-foreground">
//         <span className="rounded-lg border border-border/70 bg-muted/40 p-2">
//           <Icon className="size-4" />
//         </span>
//         <h4 className="text-sm font-medium">{title}</h4>
//       </div>
//       <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
//     </div>
//   );
// }

async function readAppInfo(): Promise<AppInfo> {
  try {
    const [name, version, tauriVersion, identifier] = await Promise.all([
      getName(),
      getVersion(),
      getTauriVersion(),
      getIdentifier(),
    ]);

    return {
      identifier,
      name,
      tauriVersion,
      version,
    };
  } catch {
    return FALLBACK_APP_INFO;
  }
}

export function AboutSettings() {
  const [appInfo, setAppInfo] = useState<AppInfo>(FALLBACK_APP_INFO);

  useEffect(() => {
    let active = true;

    void readAppInfo().then((nextInfo) => {
      if (!active) {
        return;
      }

      setAppInfo(nextInfo);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border bg-linear-to-br from-primary/12 via-background to-background shadow-xs">
        <div className="flex flex-col gap-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <h1 className="text-4xl font-medium tracking-tight mb-4">
                <span className="text-muted-foreground">Madora</span>
              </h1>
              <div className="space-y-2">
                <h1 className="text-4xl font-medium tracking-tight mb-4">
                  Markdown editing
                  <br />
                  <span className="text-muted-foreground">powered by AI</span>
                </h1>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AboutStat label="Version" value={appInfo.version} />
            <AboutStat label="By" value="ichiyo" />
          </div>
        </div>
      </section>
    </div>
  );
}

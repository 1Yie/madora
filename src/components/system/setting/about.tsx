import { getIdentifier, getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

import packageJson from "../../../../package.json";
import { AboutStat } from "@/components/system/setting/shared";
import { ExternalLinkAnchor } from "@/components/ui/external-link";

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

const WEBSITE_URL = "https://madora.ichiyo.in";
const SOURCE_CODE_URL = "https://github.com/1Yie/madora";

async function readAppInfo(): Promise<AppInfo> {
  try {
    const [name, version, tauriVersion, identifier] = await Promise.all([
      getName(),
      getVersion(),
      getTauriVersion(),
      getIdentifier(),
    ]);

    return { identifier, name, tauriVersion, version };
  } catch {
    return FALLBACK_APP_INFO;
  }
}

export function AboutSettings() {
  const [appInfo, setAppInfo] = useState<AppInfo>(FALLBACK_APP_INFO);

  useEffect(() => {
    let active = true;

    void readAppInfo().then((nextInfo) => {
      if (!active) return;
      setAppInfo(nextInfo);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border bg-linear-to-br from-primary/12 via-background to-background shadow-xs">
        <div className="flex flex-col gap-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <h1 className="text-4xl font-medium tracking-tight mb-4">
                <span className="text-muted-foreground">Madora</span>
              </h1>
              <div className="space-y-2">
                <h1 className="text-4xl font-medium tracking-tight mb-4">
                  Markdown editing,
                  <br />
                  <span className="text-muted-foreground">powered by AI</span>
                </h1>
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AboutStat label="Version" value={appInfo.version} />
            <AboutStat label="By" value="ichiyo" />
            <AboutStat
              label="Website"
              value={<ExternalLinkAnchor href={WEBSITE_URL}>{WEBSITE_URL}</ExternalLinkAnchor>}
            />
            <AboutStat
              label="Source Code"
              value={
                <ExternalLinkAnchor href={SOURCE_CODE_URL}>{SOURCE_CODE_URL}</ExternalLinkAnchor>
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}

import { Bolt, XIcon } from 'lucide-react';
import { useState } from 'react';
import { AboutSettings } from '@/components/system/setting/about';
import { AppearanceSettings } from '@/components/system/setting/appearance';
import { EditorSettings } from '@/components/system/setting/editor';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogClose, DialogPopup } from '@/components/ui/dialog';
import {
	DialogSidebar,
	type DialogSidebarItem,
} from '@/components/ui/dialog-sidebar';
import {
	settingsSections,
	type SettingsSectionId,
} from '@/components/system/setting/types';

function SettingsContent({ section }: { section: SettingsSectionId }) {
	if (section === 'editor') return <EditorSettings />;
	if (section === 'about') return <AboutSettings />;
	return <AppearanceSettings />;
}

export function SettingsDialog() {
	const [open, setOpen] = useState(false);
	const [activeSection, setActiveSection] =
		useState<SettingsSectionId>('appearance');

	const currentSection =
		settingsSections.find((section) => section.id === activeSection) ??
		settingsSections[0];

	return (
		<>
			<Button
				aria-label="打开设置"
				className="h-full rounded-full border-transparent text-muted-foreground
					hover:bg-accent hover:text-accent-foreground"
				size="sm"
				variant="ghost"
				onClick={() => setOpen(true)}
			>
				<Bolt size={14} />
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogPopup
					showCloseButton={false}
					className="max-h-[calc(100vh-3rem)] max-w-[calc(100vw-3rem)]
						overflow-hidden"
				>
					<div
						className="flex h-[calc(100vh-5rem)] min-h-0 min-w-0 flex-col
							overflow-hidden"
					>
						<DialogClose
							className="absolute inset-e-3 top-3 z-10"
							render={<Button size="icon" variant="ghost" />}
						>
							<XIcon />
						</DialogClose>
						<div
							className="flex min-h-0 min-w-0 flex-1 overflow-hidden flex-row"
						>
							<DialogSidebar
								items={settingsSections as DialogSidebarItem[]}
								activeId={activeSection}
								onSelect={(id) => setActiveSection(id as SettingsSectionId)}
							/>
							<section
								className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden
									bg-popover"
							>
								<ScrollArea className="min-h-0 flex-1">
									<div className="space-y-6 p-4 sm:p-6">
										<div className="space-y-1">
											<p
												className="text-xs font-medium uppercase
													tracking-[0.18em] text-muted-foreground"
											>
												{currentSection.label}
											</p>
											<h3 className="text-2xl font-semibold text-foreground">
												{currentSection.description}
											</h3>
										</div>
										<SettingsContent section={currentSection.id} />
									</div>
								</ScrollArea>
							</section>
						</div>
					</div>
				</DialogPopup>
			</Dialog>
		</>
	);
}

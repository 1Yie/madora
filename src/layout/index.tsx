import type { ComponentProps } from 'react';
import { WorkspaceBrowser } from '@/components/explorer/workspace/workspace-browser';

export function MainLayout(props: ComponentProps<typeof WorkspaceBrowser>) {
	return <WorkspaceBrowser {...props} />;
}

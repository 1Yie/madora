import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export function AppEdgeFade({
	backgroundColor,
	height,
	position,
}: {
	backgroundColor: string;
	height: number;
	position: 'top' | 'bottom';
}) {
	const isTop = position === 'top';

	return (
		<View
			pointerEvents="none"
			className={`absolute left-0 right-0 z-10 ${isTop ? 'top-0' : 'bottom-0'}`}
			style={{ height }}
		>
			<Svg
				height={height}
				width="100%"
				viewBox={`0 0 100 ${height}`}
				preserveAspectRatio="none"
			>
				<Defs>
					<LinearGradient
						id={`app-${position}-fade`}
						x1="0"
						x2="0"
						y1={isTop ? '0' : '1'}
						y2={isTop ? '1' : '0'}
					>
						<Stop offset="0" stopColor={backgroundColor} stopOpacity="0.95" />
						<Stop offset="0.3" stopColor={backgroundColor} stopOpacity="0.75" />
						<Stop offset="0.6" stopColor={backgroundColor} stopOpacity="0.4" />
						<Stop
							offset="0.85"
							stopColor={backgroundColor}
							stopOpacity="0.12"
						/>
						<Stop offset="1" stopColor={backgroundColor} stopOpacity="0" />
					</LinearGradient>
				</Defs>
				<Rect fill={`url(#app-${position}-fade)`} height={height} width="100" />
			</Svg>
		</View>
	);
}

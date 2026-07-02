import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

import { parsePairingPayload } from '../lib/protocol';

export function QrScanner({
	visible,
	onClose,
	onScanned,
}: {
	visible: boolean;
	onClose: () => void;
	onScanned: (raw: string) => void;
}) {
	const [permission, requestPermission] = useCameraPermissions();
	const [scanned, setScanned] = useState(false);

	const handleScan = ({ data }: { data: string }) => {
		if (scanned) return;
		if (!parsePairingPayload(data)) return; // ignore non-madora QRs
		setScanned(true);
		onScanned(data);
	};

	const handleClose = () => {
		setScanned(false);
		onClose();
	};

	if (!visible) return null;

	const hasPermission = permission?.granted;

	return (
		<Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
			<VStack style={{ flex: 1, backgroundColor: '#000' }}>
				<View
					style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 }}
				>
					<Heading size="lg" style={{ color: '#fff' }}>
						Scan Desktop QR
					</Heading>
					<Text size="sm" style={{ color: '#aaa', marginTop: 4 }}>
						Point the camera at the QR code shown in Madora desktop settings.
					</Text>
				</View>

				{hasPermission ? (
					<View
						style={{
							flex: 1,
							borderRadius: 16,
							overflow: 'hidden',
							margin: 16,
						}}
					>
						<CameraView
							barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
							onBarcodeScanned={handleScan}
							style={{ flex: 1 }}
						/>
					</View>
				) : (
					<VStack
						style={{
							flex: 1,
							alignItems: 'center',
							justifyContent: 'center',
							gap: 12,
							paddingHorizontal: 32,
						}}
					>
						<Text style={{ color: '#ccc', textAlign: 'center' }}>
							Camera access is needed to scan the pairing QR code.
						</Text>
						<Button onPress={requestPermission}>
							<ButtonText>Grant Camera Access</ButtonText>
						</Button>
					</VStack>
				)}

				<Pressable
					onPress={handleClose}
					style={{
						paddingVertical: 16,
						paddingHorizontal: 16,
						alignItems: 'center',
						marginBottom: 32,
					}}
				>
					<Text style={{ color: '#fff', fontSize: 16 }}>Cancel</Text>
				</Pressable>
			</VStack>
		</Modal>
	);
}

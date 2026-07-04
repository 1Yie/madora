import { Keyboard, Platform, TextInput } from 'react-native';

const KEYBOARD_HIDE_TIMEOUT_MS =
	Platform.select({ android: 220, default: 120, ios: 280 }) ?? 120;
const BLUR_SETTLE_TIMEOUT_MS =
	Platform.select({ android: 60, default: 32, ios: 80 }) ?? 32;

function hasFocusedTextInput() {
	try {
		return Boolean(TextInput.State.currentlyFocusedInput?.());
	} catch {
		return false;
	}
}

export function runAfterKeyboardSettled(action: () => void) {
	let finished = false;
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let keyboardHideSubscription: ReturnType<typeof Keyboard.addListener> | null =
		null;

	const run = () => {
		if (finished) return;
		finished = true;

		keyboardHideSubscription?.remove();
		keyboardHideSubscription = null;

		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}

		requestAnimationFrame(action);
	};

	const shouldWait = Keyboard.isVisible() || hasFocusedTextInput();
	Keyboard.dismiss();

	if (shouldWait) {
		keyboardHideSubscription = Keyboard.addListener('keyboardDidHide', run);
		timeout = setTimeout(run, KEYBOARD_HIDE_TIMEOUT_MS);
	} else {
		timeout = setTimeout(run, BLUR_SETTLE_TIMEOUT_MS);
	}

	return () => {
		finished = true;
		keyboardHideSubscription?.remove();
		if (timeout) clearTimeout(timeout);
	};
}

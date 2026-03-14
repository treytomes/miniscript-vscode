function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remSeconds = seconds % 60;
	return minutes > 0
		? `${minutes}m ${remSeconds}s`
		: `${remSeconds}s`;
}

export default formatDuration;
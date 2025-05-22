declare module "sound-play" {
	function play(filepath: string, volume?: number): Promise<void>
	export = play
}
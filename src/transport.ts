export const ACTION_CHANNEL = 'arara-vibes:action';
export interface ShellReply { status: number; result: unknown }
export interface ShellBridge { action(input: Record<string, unknown>): Promise<ShellReply> }

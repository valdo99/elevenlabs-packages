import { SessionConfig, Callbacks, Status, ClientToolsConfig } from "@11labs/client";
import { InputConfig } from "@11labs/client/dist/utils/input";
export type { Role, Mode, Status, SessionConfig, DisconnectionDetails, } from "@11labs/client";
export { postOverallFeedback } from "@11labs/client";
export type HookOptions = Partial<SessionConfig & HookCallbacks & ClientToolsConfig & InputConfig>;
export type HookCallbacks = Pick<Callbacks, "onConnect" | "onDisconnect" | "onError" | "onMessage" | "onDebug" | "onUnhandledClientToolCall">;
export declare function useConversation<T extends HookOptions>(defaultOptions?: T): {
    startSession: T extends SessionConfig ? (options?: HookOptions) => Promise<string> : (options: SessionConfig & HookOptions) => Promise<string>;
    endSession: () => Promise<void>;
    setVolume: ({ volume }: {
        volume: number;
    }) => void;
    getInputByteFrequencyData: () => Uint8Array<ArrayBuffer> | undefined;
    getOutputByteFrequencyData: () => Uint8Array<ArrayBuffer> | undefined;
    getInputVolume: () => number;
    getOutputVolume: () => number;
    sendFeedback: (like: boolean) => void;
    status: Status;
    canSendFeedback: boolean;
    isSpeaking: boolean;
};

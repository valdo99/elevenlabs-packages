import { Input, InputConfig } from "./utils/input";
import { Output } from "./utils/output";
import { OnDisconnectCallback, SessionConfig } from "./utils/connection";
import { ClientToolCallEvent } from "./utils/events";
export type { IncomingSocketEvent } from "./utils/events";
export type { SessionConfig, DisconnectionDetails } from "./utils/connection";
export type Role = "user" | "ai";
export type Mode = "speaking" | "listening";
export type Status = "connecting" | "connected" | "disconnecting" | "disconnected";
export type Options = SessionConfig & Callbacks & ClientToolsConfig & InputConfig;
export type ClientToolsConfig = {
    clientTools: Record<string, (parameters: any) => Promise<string | number | void> | string | number | void>;
};
export type Callbacks = {
    onConnect: (props: {
        conversationId: string;
    }) => void;
    onDebug: (props: any) => void;
    onDisconnect: OnDisconnectCallback;
    onError: (message: string, context?: any) => void;
    onMessage: (props: {
        message: string;
        source: Role;
    }) => void;
    onModeChange: (prop: {
        mode: Mode;
    }) => void;
    onStatusChange: (prop: {
        status: Status;
    }) => void;
    onCanSendFeedbackChange: (prop: {
        canSendFeedback: boolean;
    }) => void;
    onUnhandledClientToolCall?: (params: ClientToolCallEvent["client_tool_call"]) => void;
};
export declare class Conversation {
    private readonly options;
    private readonly connection;
    readonly input: Input;
    readonly output: Output;
    static startSession(options: SessionConfig & Partial<Callbacks> & Partial<ClientToolsConfig> & Partial<InputConfig>): Promise<Conversation>;
    private lastInterruptTimestamp;
    private mode;
    private status;
    private inputFrequencyData?;
    private outputFrequencyData?;
    private volume;
    private currentEventId;
    private lastFeedbackEventId;
    private canSendFeedback;
    private constructor();
    endSession: () => Promise<void>;
    private endSessionWithDetails;
    private updateMode;
    private updateStatus;
    private updateCanSendFeedback;
    private onMessage;
    private onInputWorkletMessage;
    private onOutputWorkletMessage;
    private addAudioBase64Chunk;
    private fadeOutAudio;
    private onError;
    private calculateVolume;
    getId: () => string;
    isOpen: () => boolean;
    setVolume: ({ volume }: {
        volume: number;
    }) => void;
    getInputByteFrequencyData: () => Uint8Array<ArrayBufferLike>;
    getOutputByteFrequencyData: () => Uint8Array<ArrayBufferLike>;
    getInputVolume: () => number;
    getOutputVolume: () => number;
    sendFeedback: (like: boolean) => void;
}
export declare function postOverallFeedback(conversationId: string, like: boolean, origin?: string): Promise<Response>;

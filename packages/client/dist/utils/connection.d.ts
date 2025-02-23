import { OutgoingSocketEvent, IncomingSocketEvent } from "./events";
export type Language = "en" | "ja" | "zh" | "de" | "hi" | "fr" | "ko" | "pt" | "it" | "es" | "id" | "nl" | "tr" | "pl" | "sv" | "bg" | "ro" | "ar" | "cs" | "el" | "fi" | "ms" | "da" | "ta" | "uk" | "ru" | "hu" | "no" | "vi";
export type SessionConfig = {
    origin?: string;
    authorization?: string;
    overrides?: {
        agent?: {
            prompt?: {
                prompt?: string;
            };
            firstMessage?: string;
            language?: Language;
        };
        tts?: {
            voiceId?: string;
        };
    };
    customLlmExtraBody?: any;
    dynamicVariables?: Record<string, string | number | boolean>;
    connectionDelay?: {
        default: number;
        android?: number;
        ios?: number;
    };
} & ({
    signedUrl: string;
    agentId?: undefined;
} | {
    agentId: string;
    signedUrl?: undefined;
});
export type FormatConfig = {
    format: "pcm" | "ulaw";
    sampleRate: number;
};
export type DisconnectionDetails = {
    reason: "error";
    message: string;
    context: Event;
} | {
    reason: "agent";
    context: CloseEvent;
} | {
    reason: "user";
};
export type OnDisconnectCallback = (details: DisconnectionDetails) => void;
export type OnMessageCallback = (event: IncomingSocketEvent) => void;
export declare class Connection {
    readonly socket: WebSocket;
    readonly conversationId: string;
    readonly inputFormat: FormatConfig;
    readonly outputFormat: FormatConfig;
    static create(config: SessionConfig): Promise<Connection>;
    private queue;
    private disconnectionDetails;
    private onDisconnectCallback;
    private onMessageCallback;
    private constructor();
    close(): void;
    sendMessage(message: OutgoingSocketEvent): void;
    onMessage(callback: OnMessageCallback): void;
    onDisconnect(callback: OnDisconnectCallback): void;
    private disconnect;
}
